-- ============================================================
-- Credential Vault: passwords encrypted with Supabase Vault.
-- Saved logins live in admin_config.external_links (label, url, username…).
-- Passwords no longer sit there in readable form: each one is stored as a
-- Vault secret (encrypted at rest with a key kept outside the table) and is
-- decrypted only on request, for members of that family, by
-- get_credential_password(). Links keep a `cred_id` and `has_password`.
--
-- A trigger moves any password the app sends into Vault and strips it from
-- the JSON, so older app builds keep working and nothing readable is stored.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS credential_secrets (
    admin_config_id UUID NOT NULL REFERENCES admin_config(id) ON DELETE CASCADE,
    cred_id         UUID NOT NULL,
    athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
    secret_id       UUID NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (admin_config_id, cred_id)
);
-- No policies: only the SECURITY DEFINER functions below touch this table.
ALTER TABLE credential_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON credential_secrets FROM anon, authenticated;

-- Same rule as the admin_config read policy (00027): owner, or a co-parent
-- who shares athletes with the owner.
CREATE OR REPLACE FUNCTION can_read_family_config(p_config_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM admin_config ac
        WHERE ac.id = p_config_id
          AND (ac.user_id = auth.uid() OR ac.user_id IN (
                SELECT DISTINCT p.admin_id FROM admin_athletes p
                JOIN admin_athletes me ON me.athlete_id = p.athlete_id
                WHERE me.admin_id = auth.uid() AND p.is_primary = true))
    );
$$;

-- Saving: the owner, or a co-parent with manage permission on a shared athlete.
CREATE OR REPLACE FUNCTION can_write_family_config(p_config_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM admin_config ac
        WHERE ac.id = p_config_id
          AND (ac.user_id = auth.uid() OR ac.user_id IN (
                SELECT DISTINCT p.admin_id FROM admin_athletes p
                JOIN admin_athletes me ON me.athlete_id = p.athlete_id
                WHERE me.admin_id = auth.uid() AND me.permission = 'manage' AND p.is_primary = true))
    );
$$;

-- Internal: store/replace one password in Vault (no access check; callers check).
CREATE OR REPLACE FUNCTION vault_put_credential(p_config_id UUID, p_cred_id UUID, p_athlete_id UUID, p_password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret UUID;
BEGIN
    SELECT secret_id INTO v_secret FROM credential_secrets WHERE admin_config_id = p_config_id AND cred_id = p_cred_id;
    IF v_secret IS NULL THEN
        v_secret := vault.create_secret(p_password, 'rally_cred_' || p_cred_id::text, 'RallyHUB saved login password');
        INSERT INTO credential_secrets (admin_config_id, cred_id, athlete_id, secret_id)
        VALUES (p_config_id, p_cred_id, p_athlete_id, v_secret);
    ELSE
        PERFORM vault.update_secret(v_secret, p_password);
        UPDATE credential_secrets SET athlete_id = p_athlete_id, updated_at = now()
         WHERE admin_config_id = p_config_id AND cred_id = p_cred_id;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION vault_put_credential(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION vault_drop_credential(p_config_id UUID, p_cred_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret UUID;
BEGIN
    DELETE FROM credential_secrets WHERE admin_config_id = p_config_id AND cred_id = p_cred_id RETURNING secret_id INTO v_secret;
    IF v_secret IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_secret; END IF;
END;
$$;
REVOKE ALL ON FUNCTION vault_drop_credential(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Reveal one password (family members; an athlete for their own logins).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_credential_password(p_config_id UUID, p_cred_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_row credential_secrets%ROWTYPE; v_pw TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT * INTO v_row FROM credential_secrets WHERE admin_config_id = p_config_id AND cred_id = p_cred_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF NOT (can_read_family_config(p_config_id)
            OR (v_row.athlete_id IS NOT NULL AND EXISTS (SELECT 1 FROM athletes WHERE id = v_row.athlete_id AND user_id = auth.uid()))) THEN
        RAISE EXCEPTION 'not found';
    END IF;
    SELECT decrypted_secret INTO v_pw FROM vault.decrypted_secrets WHERE id = v_row.secret_id;
    RETURN v_pw;
END;
$$;
GRANT EXECUTE ON FUNCTION get_credential_password(UUID, UUID) TO authenticated;

-- Remove a saved password (keeps the login's other fields).
CREATE OR REPLACE FUNCTION clear_credential_password(p_config_id UUID, p_cred_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT can_write_family_config(p_config_id) THEN RAISE EXCEPTION 'not found'; END IF;
    PERFORM vault_drop_credential(p_config_id, p_cred_id);
    UPDATE admin_config
       SET external_links = (
           SELECT COALESCE(jsonb_agg(CASE WHEN e->>'cred_id' = p_cred_id::text
                                          THEN e || '{"has_password": false}'::jsonb ELSE e END), '[]'::jsonb)
           FROM jsonb_array_elements(external_links) e)
     WHERE id = p_config_id;
END;
$$;
GRANT EXECUTE ON FUNCTION clear_credential_password(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- Trigger: any password written into external_links goes to Vault; the JSON
-- keeps only cred_id + has_password. Deleted logins drop their secret.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION external_links_to_vault()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    e JSONB; out_links JSONB := '[]'::jsonb; v_cred UUID; v_pw TEXT; v_ath UUID; kept UUID[] := '{}';
BEGIN
    IF NEW.external_links IS NULL OR jsonb_typeof(NEW.external_links) <> 'array' THEN RETURN NEW; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(NEW.external_links) LOOP
        v_cred := COALESCE(NULLIF(e->>'cred_id', '')::uuid, gen_random_uuid());
        v_pw := NULLIF(e->>'password', '');
        v_ath := NULLIF(e->>'athlete_id', '')::uuid;
        IF v_pw IS NOT NULL THEN
            PERFORM vault_put_credential(NEW.id, v_cred, v_ath, v_pw);
            e := e || jsonb_build_object('has_password', true);
        END IF;
        e := (e - 'password') || jsonb_build_object('cred_id', v_cred, 'password', NULL);
        out_links := out_links || jsonb_build_array(e);
        kept := kept || v_cred;
    END LOOP;
    NEW.external_links := out_links;
    -- Logins removed from the list take their saved password with them.
    IF TG_OP = 'UPDATE' THEN
        PERFORM vault_drop_credential(NEW.id, cs.cred_id)
          FROM credential_secrets cs WHERE cs.admin_config_id = NEW.id AND NOT (cs.cred_id = ANY (kept));
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS admin_config_links_to_vault ON admin_config;
CREATE TRIGGER admin_config_links_to_vault
    BEFORE INSERT OR UPDATE OF external_links ON admin_config
    FOR EACH ROW EXECUTE FUNCTION external_links_to_vault();

-- ------------------------------------------------------------
-- One-time move: re-save every family's links through the trigger, which
-- encrypts existing passwords and strips the readable copies.
-- ------------------------------------------------------------
UPDATE admin_config SET external_links = external_links
 WHERE external_links IS NOT NULL AND jsonb_typeof(external_links) = 'array';

-- Check (should be 0): logins that still carry a readable password.
SELECT count(*) AS readable_passwords_left
  FROM admin_config ac, jsonb_array_elements(ac.external_links) e
 WHERE NULLIF(e->>'password', '') IS NOT NULL;
