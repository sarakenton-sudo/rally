-- ============================================================
-- Fan accounts: guests become app users (grandparents, family, friends).
-- A parent invites a guest → link rally-hub.com/fan/<code> → the guest signs
-- up (or in) → accept_fan_invite links them as a read-only fan of that
-- athlete. Fans see the family's upcoming tournaments (dates, venues,
-- streams, tickets) through my_fan_family() — no RLS on parent tables.
-- ============================================================

-- Role for fan-only accounts. (Enum values can't be used in the same
-- transaction they're added in; the functions below only reference it as
-- text at run time.)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'fan';

ALTER TABLE guests ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS fan_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'none'
    CHECK (invite_status IN ('none', 'sent', 'joined'));
ALTER TABLE guests ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
-- Phone is no longer required: app invites can go by email or a shared link.
ALTER TABLE guests ALTER COLUMN phone DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_fan_user ON guests(fan_user_id) WHERE fan_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- create_fan_invite — parent gets (or reuses) a guest's invite code
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fan_invite(p_guest_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guest guests%ROWTYPE;
    v_code  TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT * INTO v_guest FROM guests WHERE id = p_guest_id;
    IF NOT FOUND OR v_guest.athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'guest not found';
    END IF;
    v_code := v_guest.invite_code;
    IF v_code IS NULL THEN
        LOOP
            v_code := array_to_string(ARRAY(
                SELECT substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1)
                FROM generate_series(1, 8)), '');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM guests WHERE invite_code = v_code);
        END LOOP;
    END IF;
    UPDATE guests
       SET invite_code = v_code,
           invite_status = CASE WHEN invite_status = 'joined' THEN 'joined' ELSE 'sent' END,
           invited_at = now()
     WHERE id = p_guest_id;
    RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION create_fan_invite(UUID) TO authenticated;

-- ------------------------------------------------------------
-- get_fan_invite — public greeting for rally-hub.com/fan/<code>
-- First names only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_fan_invite(p_code TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'guest_name', split_part(trim(g.name), ' ', 1),
        'athlete_first_name', a.first_name,
        'joined', g.invite_status = 'joined'
    )
    FROM guests g JOIN athletes a ON a.id = g.athlete_id
    WHERE g.invite_code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'))
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_fan_invite(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- accept_fan_invite — signed-in person becomes a fan of that athlete.
-- Accounts that already manage athletes or coach keep their role (they
-- just gain the fan view of this family too).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_fan_invite(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guest   guests%ROWTYPE;
    v_name    TEXT;
    v_has_own BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT * INTO v_guest FROM guests
     WHERE invite_code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'That fan code isn''t valid. Ask the family to send a new invite.');
    END IF;
    IF v_guest.fan_user_id IS NOT NULL AND v_guest.fan_user_id <> auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'This invite was already used by another account.');
    END IF;

    UPDATE guests SET fan_user_id = auth.uid(), invite_status = 'joined', joined_at = COALESCE(joined_at, now())
     WHERE id = v_guest.id;

    -- Fan-only account unless they already run a family or coach.
    v_has_own := EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid())
              OR EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
              OR EXISTS (SELECT 1 FROM athletes WHERE user_id = auth.uid());
    IF NOT v_has_own THEN
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'fan')
        ON CONFLICT (id) DO UPDATE SET role = 'fan';
    END IF;

    SELECT first_name INTO v_name FROM athletes WHERE id = v_guest.athlete_id;
    RETURN json_build_object('success', true, 'athlete_first_name', v_name, 'fan_only', NOT v_has_own);
END;
$$;
GRANT EXECUTE ON FUNCTION accept_fan_invite(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- my_fan_family — everything a fan sees: upcoming tournaments for every
-- athlete they follow. Read-only, first names only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION my_fan_family()
RETURNS TABLE (
    tournament_id UUID, name TEXT, start_date DATE, end_date DATE, location_city TEXT,
    venues JSONB, streaming_links JSONB, ticket_link TEXT, schedule_link TEXT,
    default_stream_url TEXT, team_name TEXT, athlete_id UUID, athlete_first_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id, t.name, t.start_date, t.end_date, t.location_city,
           to_jsonb(t.venues), to_jsonb(t.streaming_links), t.ticket_link, t.schedule_link,
           s.default_stream_url, s.team_name, a.id, a.first_name
    FROM guests g
    JOIN athletes a ON a.id = g.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN tournaments t ON t.season_id = s.id
    WHERE g.fan_user_id = auth.uid()
      AND t.end_date >= CURRENT_DATE
    ORDER BY t.start_date, a.first_name;
$$;
GRANT EXECUTE ON FUNCTION my_fan_family() TO authenticated;

-- Athletes a fan follows (for the fan home header and empty states).
CREATE OR REPLACE FUNCTION my_followed_athletes()
RETURNS TABLE (athlete_id UUID, first_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT a.id, a.first_name
    FROM guests g JOIN athletes a ON a.id = g.athlete_id
    WHERE g.fan_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_followed_athletes() TO authenticated;
