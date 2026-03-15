-- Fix 1: accept_athlete_invite should auto-accept ALL pending invites for the same email
-- This handles "All Athletes" invites where multiple codes are created but user only gets one.

CREATE OR REPLACE FUNCTION accept_athlete_invite(code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite athlete_invites%ROWTYPE;
    v_sibling athlete_invites%ROWTYPE;
BEGIN
    -- Find the invite
    SELECT * INTO v_invite
    FROM athlete_invites
    WHERE invite_code = code
      AND status = 'pending'
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    -- Prevent self-invite
    IF v_invite.inviter_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Cannot accept your own invite');
    END IF;

    IF v_invite.invite_type = 'admin' THEN
        -- Create user_profiles if not exists
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'admin')
        ON CONFLICT (id) DO UPDATE SET role = 'admin';

        -- Link this athlete
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
        VALUES (auth.uid(), v_invite.athlete_id, v_invite.permission, false)
        ON CONFLICT (admin_id, athlete_id) DO NOTHING;

        -- Mark this invite accepted
        UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;

        -- Auto-accept all other pending invites from the same inviter to the same email
        FOR v_sibling IN
            SELECT * FROM athlete_invites
            WHERE inviter_id = v_invite.inviter_id
              AND email = v_invite.email
              AND invite_type = v_invite.invite_type
              AND status = 'pending'
              AND expires_at > now()
              AND id != v_invite.id
        LOOP
            INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
            VALUES (auth.uid(), v_sibling.athlete_id, v_sibling.permission, false)
            ON CONFLICT (admin_id, athlete_id) DO NOTHING;

            UPDATE athlete_invites SET status = 'accepted' WHERE id = v_sibling.id;
        END LOOP;

    ELSIF v_invite.invite_type = 'athlete' THEN
        -- Set user_profiles to athlete role
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'athlete')
        ON CONFLICT (id) DO UPDATE SET role = 'athlete';

        -- Link auth account to athletes.user_id
        UPDATE athletes SET user_id = auth.uid()
        WHERE id = v_invite.athlete_id AND user_id IS NULL;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Athlete already linked to another account');
        END IF;

        -- Mark invite accepted
        UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Invite accepted successfully');
END;
$$;


-- Fix 2: Co-parents should be able to read the primary admin's config (for credentials/external_links)
-- A co-parent can read admin_config if they share athletes with the config owner.

DROP POLICY IF EXISTS "Users read own admin config" ON admin_config;

CREATE POLICY "Users read accessible admin config"
    ON admin_config FOR SELECT
    USING (
        user_id = auth.uid()
        OR user_id IN (
            -- Primary admins who share athletes with the current user
            SELECT DISTINCT aa_primary.admin_id
            FROM admin_athletes aa_primary
            INNER JOIN admin_athletes aa_me ON aa_me.athlete_id = aa_primary.athlete_id
            WHERE aa_me.admin_id = auth.uid()
              AND aa_primary.is_primary = true
        )
    );
