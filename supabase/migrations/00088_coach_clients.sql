-- ============================================================
-- Coach clients: add a client in one step, edit client details,
-- athlete sport + positions, and a release per athlete (guardian, plus
-- an optional athlete co-signature).
--
-- Add a client (coach_add_client):
--   * Parent already on RallyHUB (matched by account email) → connected now;
--     the athlete is matched by first name in their family, or added to it.
--   * Not on RallyHUB yet → a pending client (coach_pending_clients). When a
--     person signs up with that email, a trigger on user_profiles creates
--     the athlete in their family, the connection, and the group memberships.
-- Booking still requires the family to sign the coach's terms + release for
-- that specific athlete (enforce_policy_acceptance, 00069).
-- ============================================================

-- ---------- Athlete profile: sport (positions[1] = primary, positions[2] = secondary) ----------
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sport TEXT;

-- ---------- Coach-side contact details on a connection ----------
-- The parent's real profile isn't coach-editable; these are the coach's own copies.
ALTER TABLE coach_connections ADD COLUMN IF NOT EXISTS client_parent_name  TEXT;
ALTER TABLE coach_connections ADD COLUMN IF NOT EXISTS client_parent_phone TEXT;
ALTER TABLE coach_connections ADD COLUMN IF NOT EXISTS client_parent_email TEXT;
ALTER TABLE coach_connections ADD COLUMN IF NOT EXISTS coach_notes         TEXT;

-- Athletes a coach added for a connected family (beyond connection.athlete_id
-- and athletes the family has requested lessons for).
CREATE TABLE IF NOT EXISTS coach_athlete_links (
    connection_id UUID NOT NULL REFERENCES coach_connections(id) ON DELETE CASCADE,
    athlete_id    UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, athlete_id)
);
ALTER TABLE coach_athlete_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coach reads own athlete links" ON coach_athlete_links;
CREATE POLICY "Coach reads own athlete links" ON coach_athlete_links FOR SELECT
    USING (connection_id IN (SELECT id FROM coach_connections WHERE coach_id = my_coach_id()));

-- ---------- Pending clients (parent not on RallyHUB yet) ----------
CREATE TABLE IF NOT EXISTS coach_pending_clients (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id              UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_email          TEXT NOT NULL,              -- lowercased
    parent_name           TEXT,
    parent_phone          TEXT,
    athlete_first_name    TEXT NOT NULL,
    athlete_last_name     TEXT,
    sport                 TEXT,
    primary_position      TEXT,
    secondary_position    TEXT,
    grad_year             INT,
    club_team             TEXT,
    group_ids             UUID[] NOT NULL DEFAULT '{}',
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
    claimed_connection_id UUID REFERENCES coach_connections(id) ON DELETE SET NULL,
    invited_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_clients_email ON coach_pending_clients(parent_email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_clients_coach ON coach_pending_clients(coach_id);
ALTER TABLE coach_pending_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coach manages own pending clients" ON coach_pending_clients;
CREATE POLICY "Coach manages own pending clients" ON coach_pending_clients FOR ALL
    USING (coach_id = my_coach_id()) WITH CHECK (coach_id = my_coach_id());

-- ---------- Releases: who signed (guardian, or the athlete co-signing) ----------
ALTER TABLE policy_acceptances ADD COLUMN IF NOT EXISTS signer_role TEXT NOT NULL DEFAULT 'guardian';
DO $$ BEGIN
    ALTER TABLE policy_acceptances ADD CONSTRAINT policy_acceptances_signer_role_check
        CHECK (signer_role IN ('guardian', 'athlete'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only guardian signatures satisfy the booking requirement.
CREATE OR REPLACE FUNCTION has_accepted_coach_policies(p_coach_id UUID, p_athlete_id UUID, p_parent UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM policy_acceptances pa
        JOIN coaches c ON c.id = pa.coach_id
        WHERE pa.coach_id = p_coach_id AND pa.athlete_id = p_athlete_id
          AND pa.parent_user_id = p_parent
          AND pa.signer_role = 'guardian'
          AND pa.policies_version >= c.policies_updated_at
    );
$$;
GRANT EXECUTE ON FUNCTION has_accepted_coach_policies(UUID, UUID, UUID) TO authenticated;

-- The athlete (own RallyHUB login) co-signs the coach's terms + release.
CREATE OR REPLACE FUNCTION accept_coach_policies_as_athlete(p_coach_id UUID, p_signer_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_athlete UUID;
    v_pol     JSONB;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT id INTO v_athlete FROM athletes WHERE user_id = auth.uid() LIMIT 1;
    IF v_athlete IS NULL THEN RAISE EXCEPTION 'only an athlete account can co-sign'; END IF;
    IF length(trim(COALESCE(p_signer_name, ''))) < 2 THEN RAISE EXCEPTION 'type your full name to sign'; END IF;
    v_pol := get_coach_policies(p_coach_id);
    IF v_pol IS NULL THEN RAISE EXCEPTION 'coach not found'; END IF;
    INSERT INTO policy_acceptances (coach_id, parent_user_id, athlete_id, signer_name, terms_text, release_text, platform_text, policies_version, signer_role)
    VALUES (p_coach_id, auth.uid(), v_athlete, trim(p_signer_name),
            v_pol->>'terms', v_pol->>'release', v_pol->>'platform', (v_pol->>'version')::timestamptz, 'athlete');
END;
$$;
GRANT EXECUTE ON FUNCTION accept_coach_policies_as_athlete(UUID, TEXT) TO authenticated;

-- ---------- Athletes shown on a client (now incl. coach-added, sport, health FYI, releases) ----------
CREATE OR REPLACE FUNCTION coach_client_athletes(p_coach_id UUID, p_parent UUID, p_athlete UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'photo_url', a.photo_url,
        'sport', a.sport,
        'grad_year', a.grad_year,
        'positions', a.positions,
        'level', a.level,
        'club_team', a.club_team,
        'height_inches', a.height_inches,
        'goals', a.goals,
        'has_login', a.user_id IS NOT NULL,
        'allergies', a.allergies,
        'emergency_contact_name', a.emergency_contact_name,
        'emergency_contact_phone', a.emergency_contact_phone,
        'release', (SELECT jsonb_build_object('signer_name', pa.signer_name, 'accepted_at', pa.accepted_at,
                                              'outdated', pa.policies_version < c.policies_updated_at)
                      FROM policy_acceptances pa JOIN coaches c ON c.id = pa.coach_id
                     WHERE pa.coach_id = p_coach_id AND pa.athlete_id = a.id AND pa.signer_role = 'guardian'
                     ORDER BY pa.accepted_at DESC LIMIT 1),
        'athlete_signed_at', (SELECT max(pa.accepted_at) FROM policy_acceptances pa
                               WHERE pa.coach_id = p_coach_id AND pa.athlete_id = a.id AND pa.signer_role = 'athlete')
    ) ORDER BY a.first_name), '[]'::jsonb)
    FROM athletes a
    WHERE a.deleted_at IS NULL AND (
          a.id = p_athlete
       OR a.id IN (SELECT athlete_id FROM booking_requests
                    WHERE coach_id = p_coach_id AND parent_user_id = p_parent)
       OR a.id IN (SELECT l.athlete_id FROM coach_athlete_links l
                     JOIN coach_connections cc ON cc.id = l.connection_id
                    WHERE cc.coach_id = p_coach_id AND cc.parent_user_id = p_parent));
$$;
REVOKE EXECUTE ON FUNCTION coach_client_athletes(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_coach_client_roster()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'connection_id', cc.id,
        'status', cc.status,
        'connected_at', cc.created_at,
        'parent_name', COALESCE(NULLIF(trim(cc.client_parent_name), ''), up.display_name),
        'parent_email', COALESCE(NULLIF(trim(cc.client_parent_email), ''), u.email),
        'parent_phone', cc.client_parent_phone,
        'account_email', u.email,
        'coach_notes', cc.coach_notes,
        'athletes', coach_client_athletes(cc.coach_id, cc.parent_user_id, cc.athlete_id),
        'group_ids', COALESCE((SELECT array_agg(m.group_id) FROM client_group_members m
                               WHERE m.connection_id = cc.id), '{}'::uuid[]),
        'lessons_booked', (SELECT count(*) FROM bookings b
                           WHERE b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
                             AND b.status IN ('confirmed', 'completed')),
        'pending_requests', (SELECT count(*) FROM booking_requests r
                             WHERE r.coach_id = cc.coach_id AND r.parent_user_id = cc.parent_user_id
                               AND r.status = 'requested'),
        'unpaid_lessons', (SELECT count(*) FROM bookings b JOIN slots s ON s.id = b.slot_id
                           WHERE b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
                             AND b.status IN ('confirmed', 'completed') AND s.ends_at < now()
                             AND b.payment_status NOT IN ('captured', 'refunded')),
        'next_lesson_at', (SELECT min(s.starts_at) FROM bookings b JOIN slots s ON s.id = b.slot_id
                           WHERE b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
                             AND b.status = 'confirmed' AND s.starts_at >= now()),
        'last_lesson_at', (SELECT max(s.starts_at) FROM bookings b JOIN slots s ON s.id = b.slot_id
                           WHERE b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
                             AND b.status IN ('confirmed', 'completed') AND s.starts_at < now())
    )
    FROM coach_connections cc
    LEFT JOIN user_profiles up ON up.id = cc.parent_user_id
    LEFT JOIN auth.users u ON u.id = cc.parent_user_id
    WHERE cc.coach_id = my_coach_id()
    ORDER BY cc.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION get_coach_client_roster() TO authenticated;

-- Recent lessons for one client, with payment status (Client Detail).
CREATE OR REPLACE FUNCTION get_coach_client_lessons(p_connection_id UUID)
RETURNS TABLE (booking_id UUID, starts_at TIMESTAMPTZ, status TEXT, payment_status TEXT, payment_method TEXT,
               price_cents INT, athlete_first_name TEXT, session_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT b.id, s.starts_at, b.status, b.payment_status, b.payment_method, b.price_cents, a.first_name, st.name
    FROM coach_connections cc
    JOIN bookings b ON b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
    JOIN slots s ON s.id = b.slot_id
    LEFT JOIN athletes a ON a.id = b.athlete_id
    LEFT JOIN booking_requests r ON r.id = b.request_id
    LEFT JOIN session_types st ON st.id = r.session_type_id
    WHERE cc.id = p_connection_id AND cc.coach_id = my_coach_id()
    ORDER BY s.starts_at DESC
    LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION get_coach_client_lessons(UUID) TO authenticated;

-- ---------- Add a client ----------
CREATE OR REPLACE FUNCTION coach_add_client(
    p_parent_email TEXT, p_athlete_first TEXT, p_athlete_last TEXT DEFAULT NULL,
    p_parent_name TEXT DEFAULT NULL, p_parent_phone TEXT DEFAULT NULL,
    p_sport TEXT DEFAULT 'volleyball', p_primary TEXT DEFAULT NULL, p_secondary TEXT DEFAULT NULL,
    p_grad_year INT DEFAULT NULL, p_club TEXT DEFAULT NULL, p_group_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach   UUID := my_coach_id();
    v_email   TEXT := lower(trim(COALESCE(p_parent_email, '')));
    v_first   TEXT := NULLIF(trim(COALESCE(p_athlete_first, '')), '');
    v_parent  UUID;
    v_athlete UUID;
    v_conn    UUID;
    v_pending UUID;
    v_positions TEXT[] := array_remove(ARRAY[NULLIF(trim(p_primary), ''), NULLIF(trim(p_secondary), '')], NULL);
    v_groups  UUID[];
BEGIN
    IF v_coach IS NULL THEN RAISE EXCEPTION 'coach profile required'; END IF;
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'enter the parent''s email address'; END IF;
    IF v_first IS NULL THEN RAISE EXCEPTION 'enter the athlete''s first name'; END IF;
    -- Only this coach's groups.
    SELECT COALESCE(array_agg(id), '{}') INTO v_groups FROM client_groups WHERE coach_id = v_coach AND id = ANY(COALESCE(p_group_ids, '{}'));

    SELECT id INTO v_parent FROM auth.users WHERE lower(email) = v_email LIMIT 1;

    IF v_parent IS NULL THEN
        -- Not on RallyHUB yet: pending until they sign up with this email.
        SELECT id INTO v_pending FROM coach_pending_clients
         WHERE coach_id = v_coach AND parent_email = v_email AND lower(athlete_first_name) = lower(v_first) AND status = 'pending';
        IF v_pending IS NULL THEN
            INSERT INTO coach_pending_clients (coach_id, parent_email, parent_name, parent_phone, athlete_first_name, athlete_last_name,
                                               sport, primary_position, secondary_position, grad_year, club_team, group_ids)
            VALUES (v_coach, v_email, NULLIF(trim(p_parent_name), ''), NULLIF(trim(p_parent_phone), ''), v_first, NULLIF(trim(p_athlete_last), ''),
                    NULLIF(trim(p_sport), ''), NULLIF(trim(p_primary), ''), NULLIF(trim(p_secondary), ''), p_grad_year, NULLIF(trim(p_club), ''), v_groups)
            RETURNING id INTO v_pending;
        END IF;
        RETURN jsonb_build_object('status', 'pending', 'pending_id', v_pending);
    END IF;

    -- On RallyHUB: match the athlete by first name in their family, else add one.
    SELECT a.id INTO v_athlete FROM athletes a JOIN admin_athletes aa ON aa.athlete_id = a.id
     WHERE aa.admin_id = v_parent AND lower(a.first_name) = lower(v_first) AND a.deleted_at IS NULL LIMIT 1;
    IF v_athlete IS NULL THEN
        INSERT INTO athletes (first_name, last_name, grad_year, positions, club_team, sport, can_edit)
        VALUES (v_first, NULLIF(trim(p_athlete_last), ''), p_grad_year, v_positions, NULLIF(trim(p_club), ''), NULLIF(trim(p_sport), ''), false)
        RETURNING id INTO v_athlete;
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary) VALUES (v_parent, v_athlete, 'manage', false);
    END IF;

    INSERT INTO coach_connections (coach_id, parent_user_id, athlete_id, status, client_parent_name, client_parent_phone)
    VALUES (v_coach, v_parent, v_athlete, 'active', NULLIF(trim(p_parent_name), ''), NULLIF(trim(p_parent_phone), ''))
    ON CONFLICT (coach_id, parent_user_id) DO UPDATE SET
        status = 'active',
        client_parent_name = COALESCE(coach_connections.client_parent_name, EXCLUDED.client_parent_name),
        client_parent_phone = COALESCE(coach_connections.client_parent_phone, EXCLUDED.client_parent_phone)
    RETURNING id INTO v_conn;
    INSERT INTO coach_athlete_links (connection_id, athlete_id) VALUES (v_conn, v_athlete) ON CONFLICT DO NOTHING;
    INSERT INTO client_group_members (group_id, connection_id) SELECT g, v_conn FROM unnest(v_groups) g ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object('status', 'connected', 'connection_id', v_conn, 'athlete_id', v_athlete);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_add_client(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, UUID[]) TO authenticated;

-- ---------- Edit a client (coach-side contact + notes) ----------
CREATE OR REPLACE FUNCTION coach_update_client(p_connection_id UUID, p_parent_name TEXT, p_parent_phone TEXT, p_parent_email TEXT, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE coach_connections
       SET client_parent_name = NULLIF(trim(p_parent_name), ''),
           client_parent_phone = NULLIF(trim(p_parent_phone), ''),
           client_parent_email = NULLIF(lower(trim(p_parent_email)), ''),
           coach_notes = NULLIF(trim(p_notes), '')
     WHERE id = p_connection_id AND coach_id = my_coach_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION coach_update_client(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Edit an athlete on a client (name, sport, positions, grad year, club).
CREATE OR REPLACE FUNCTION coach_update_client_athlete(
    p_connection_id UUID, p_athlete_id UUID, p_first TEXT, p_last TEXT, p_sport TEXT,
    p_primary TEXT, p_secondary TEXT, p_grad_year INT, p_club TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cc coach_connections%ROWTYPE;
BEGIN
    SELECT * INTO v_cc FROM coach_connections WHERE id = p_connection_id AND coach_id = my_coach_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coach_client_athletes(v_cc.coach_id, v_cc.parent_user_id, v_cc.athlete_id)) x
                   WHERE (x->>'id')::uuid = p_athlete_id) THEN
        RAISE EXCEPTION 'athlete not on this client';
    END IF;
    IF NULLIF(trim(COALESCE(p_first, '')), '') IS NULL THEN RAISE EXCEPTION 'first name required'; END IF;
    UPDATE athletes
       SET first_name = trim(p_first),
           last_name = NULLIF(trim(p_last), ''),
           sport = NULLIF(trim(p_sport), ''),
           positions = array_remove(ARRAY[NULLIF(trim(p_primary), ''), NULLIF(trim(p_secondary), '')], NULL),
           grad_year = p_grad_year,
           club_team = NULLIF(trim(p_club), '')
     WHERE id = p_athlete_id;
END;
$$;
GRANT EXECUTE ON FUNCTION coach_update_client_athlete(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;

-- Family info for the "request signature" email (coach → family of a client).
CREATE OR REPLACE FUNCTION coach_client_contact(p_connection_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('parent_user_id', cc.parent_user_id, 'email', u.email, 'coach_id', cc.coach_id)
    FROM coach_connections cc JOIN auth.users u ON u.id = cc.parent_user_id
    WHERE cc.id = p_connection_id AND cc.coach_id = my_coach_id();
$$;
GRANT EXECUTE ON FUNCTION coach_client_contact(UUID) TO authenticated;

-- ---------- Claim pending clients when the parent signs up ----------
CREATE OR REPLACE FUNCTION claim_pending_coach_clients_for(p_user UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email   TEXT;
    v_p       coach_pending_clients%ROWTYPE;
    v_athlete UUID;
    v_conn    UUID;
    v_n       INT := 0;
BEGIN
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_user;
    IF v_email IS NULL THEN RETURN 0; END IF;
    FOR v_p IN SELECT * FROM coach_pending_clients WHERE parent_email = v_email AND status = 'pending' ORDER BY created_at LOOP
        SELECT a.id INTO v_athlete FROM athletes a JOIN admin_athletes aa ON aa.athlete_id = a.id
         WHERE aa.admin_id = p_user AND lower(a.first_name) = lower(v_p.athlete_first_name) AND a.deleted_at IS NULL LIMIT 1;
        IF v_athlete IS NULL THEN
            INSERT INTO athletes (first_name, last_name, grad_year, positions, club_team, sport, can_edit)
            VALUES (v_p.athlete_first_name, v_p.athlete_last_name, v_p.grad_year,
                    array_remove(ARRAY[v_p.primary_position, v_p.secondary_position], NULL), v_p.club_team, v_p.sport, false)
            RETURNING id INTO v_athlete;
            INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
            VALUES (p_user, v_athlete, 'manage', NOT EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = p_user));
        END IF;
        INSERT INTO coach_connections (coach_id, parent_user_id, athlete_id, status, client_parent_name, client_parent_phone)
        VALUES (v_p.coach_id, p_user, v_athlete, 'active', v_p.parent_name, v_p.parent_phone)
        ON CONFLICT (coach_id, parent_user_id) DO UPDATE SET status = 'active'
        RETURNING id INTO v_conn;
        INSERT INTO coach_athlete_links (connection_id, athlete_id) VALUES (v_conn, v_athlete) ON CONFLICT DO NOTHING;
        INSERT INTO client_group_members (group_id, connection_id)
            SELECT g, v_conn FROM unnest(v_p.group_ids) g
             WHERE g IN (SELECT id FROM client_groups WHERE coach_id = v_p.coach_id)
            ON CONFLICT DO NOTHING;
        UPDATE coach_pending_clients SET status = 'claimed', claimed_connection_id = v_conn WHERE id = v_p.id;
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_pending_coach_clients_for(UUID) FROM PUBLIC, anon, authenticated;

-- Callable by the signed-in user (e.g. if they existed before the coach added them under another email casing).
CREATE OR REPLACE FUNCTION claim_pending_coach_clients()
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT claim_pending_coach_clients_for(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION claim_pending_coach_clients() TO authenticated;

-- Automatic on sign-up: the new profile row triggers the claim.
CREATE OR REPLACE FUNCTION claim_pending_coach_clients_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    BEGIN
        PERFORM claim_pending_coach_clients_for(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        -- Never block sign-up on this; the app can call claim_pending_coach_clients() later.
        RAISE WARNING 'claim_pending_coach_clients failed for %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_profiles_claim_coach_clients ON user_profiles;
CREATE TRIGGER user_profiles_claim_coach_clients AFTER INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION claim_pending_coach_clients_on_signup();
