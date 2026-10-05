-- ============================================================
-- Coach invites from parents (growth loop: parents → coaches).
-- "Invite your coach" creates a short code; the link opens
-- rally-hub.com/coaches?i=<code>, which greets the coach by the
-- inviter's name. When the coach signs up, claim_coach_invite
-- connects the inviting family as their first client.
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_invites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code             TEXT NOT NULL UNIQUE,
    inviter_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id       UUID REFERENCES athletes(id) ON DELETE SET NULL,
    coach_label      TEXT,                       -- optional "Coach Ben" note for the parent's list
    status           TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'joined')),
    coach_id         UUID REFERENCES coaches(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_coach_invites_inviter ON coach_invites(inviter_user_id);

ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Inviter reads own coach invites" ON coach_invites;
CREATE POLICY "Inviter reads own coach invites" ON coach_invites
    FOR SELECT USING (inviter_user_id = auth.uid());
DROP POLICY IF EXISTS "Inviter updates own coach invites" ON coach_invites;
CREATE POLICY "Inviter updates own coach invites" ON coach_invites
    FOR UPDATE USING (inviter_user_id = auth.uid()) WITH CHECK (inviter_user_id = auth.uid());
-- Inserts go through create_coach_invite (generates the code).

-- ------------------------------------------------------------
-- create_coach_invite — new code for the signed-in parent
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_coach_invite(p_athlete_id UUID DEFAULT NULL, p_coach_label TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    -- Only tag an athlete this parent manages.
    IF p_athlete_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid() AND athlete_id = p_athlete_id
    ) THEN
        p_athlete_id := NULL;
    END IF;
    LOOP
        -- 8 chars, no look-alikes (0/O, 1/I/L).
        v_code := array_to_string(ARRAY(
            SELECT substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1)
            FROM generate_series(1, 8)), '');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM coach_invites WHERE code = v_code);
    END LOOP;
    INSERT INTO coach_invites (code, inviter_user_id, athlete_id, coach_label)
    VALUES (v_code, auth.uid(), p_athlete_id, NULLIF(trim(p_coach_label), ''));
    RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION create_coach_invite(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- get_coach_invite — public greeting for rally-hub.com/coaches?i=
-- First names only; nothing else about the family.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_invite(p_code TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'inviter_first_name', NULLIF(split_part(trim(COALESCE(up.display_name, '')), ' ', 1), ''),
        'athlete_first_name', a.first_name,
        'club', a.club_team,
        'joined', ci.status = 'joined'
    )
    FROM coach_invites ci
    LEFT JOIN user_profiles up ON up.id = ci.inviter_user_id
    LEFT JOIN athletes a ON a.id = ci.athlete_id
    WHERE ci.code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'))
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_coach_invite(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- claim_coach_invite — the signed-in coach accepts: connect the
-- inviting family. Returns the inviter's athlete first name (or '').
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_coach_invite(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id UUID := my_coach_id();
    v_invite   coach_invites%ROWTYPE;
    v_name     TEXT;
BEGIN
    IF v_coach_id IS NULL THEN RAISE EXCEPTION 'coach profile required'; END IF;
    SELECT * INTO v_invite FROM coach_invites
     WHERE code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
    IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
    IF v_invite.inviter_user_id = auth.uid() THEN RETURN ''; END IF;  -- parent who is also this coach
    IF v_invite.status = 'joined' AND v_invite.coach_id IS DISTINCT FROM v_coach_id THEN
        RAISE EXCEPTION 'invite already used';
    END IF;

    INSERT INTO coach_connections (coach_id, parent_user_id, athlete_id, status)
    VALUES (v_coach_id, v_invite.inviter_user_id, v_invite.athlete_id, 'active')
    ON CONFLICT (coach_id, parent_user_id) DO UPDATE
        SET status = 'active', athlete_id = COALESCE(coach_connections.athlete_id, EXCLUDED.athlete_id);

    UPDATE coach_invites SET status = 'joined', coach_id = v_coach_id, joined_at = COALESCE(joined_at, now())
     WHERE id = v_invite.id;

    SELECT first_name INTO v_name FROM athletes WHERE id = v_invite.athlete_id;
    RETURN COALESCE(v_name, '');
END;
$$;
GRANT EXECUTE ON FUNCTION claim_coach_invite(TEXT) TO authenticated;

-- Parent's list: their invites + the coach's name once joined.
CREATE OR REPLACE FUNCTION my_coach_invites()
RETURNS TABLE (id UUID, code TEXT, athlete_id UUID, coach_label TEXT, status TEXT, coach_name TEXT, created_at TIMESTAMPTZ, last_sent_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ci.id, ci.code, ci.athlete_id, ci.coach_label, ci.status, c.display_name, ci.created_at, ci.last_sent_at
    FROM coach_invites ci LEFT JOIN coaches c ON c.id = ci.coach_id
    WHERE ci.inviter_user_id = auth.uid()
    ORDER BY ci.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION my_coach_invites() TO authenticated;
