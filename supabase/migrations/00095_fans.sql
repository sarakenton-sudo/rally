-- ============================================================
-- Fans (replaces Guests). A fan is a friend or family member who follows
-- a family's athletes: tournaments and games only (no lessons, travel or
-- logins). The parent creates an invite, copies a text with a one-time
-- code, and the fan enters it in the app. One code = one fan account.
-- Fans follow every athlete the inviting parent manages.
--
-- Clean slate: old guest rows and links are deleted (including any leftover
-- connections from internal beta).
-- ============================================================

CREATE TABLE IF NOT EXISTS fans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- the parent who invited
    name         TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
    invite_code  TEXT NOT NULL UNIQUE,
    fan_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,      -- set when they join
    joined_at    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fans_owner ON fans(owner_id);
CREATE INDEX IF NOT EXISTS idx_fans_fan_user ON fans(fan_user_id);
ALTER TABLE fans ENABLE ROW LEVEL SECURITY;

-- Parents who share athletes with the owner (co-parents) see and manage the family's fans.
CREATE OR REPLACE FUNCTION fan_family_ok(p_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_owner = auth.uid() OR EXISTS (
        SELECT 1 FROM admin_athletes mine JOIN admin_athletes theirs ON theirs.athlete_id = mine.athlete_id
        WHERE mine.admin_id = auth.uid() AND theirs.admin_id = p_owner);
$$;
DROP POLICY IF EXISTS "Family reads fans" ON fans;
CREATE POLICY "Family reads fans" ON fans FOR SELECT USING (fan_family_ok(owner_id));
DROP POLICY IF EXISTS "Family removes fans" ON fans;
CREATE POLICY "Family removes fans" ON fans FOR DELETE USING (fan_family_ok(owner_id));
-- Inserts/joins go through the functions below.

-- Athletes a fan follows: everyone the inviting parent manages.
CREATE OR REPLACE FUNCTION fan_athlete_ids(p_owner UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT athlete_id FROM admin_athletes WHERE admin_id = p_owner;
$$;
REVOKE ALL ON FUNCTION fan_athlete_ids(UUID) FROM PUBLIC, anon, authenticated;

-- ── Parent: create an invite (returns the code) ──
DROP FUNCTION IF EXISTS create_fan_invite(UUID);
CREATE OR REPLACE FUNCTION create_fan_invite(p_name TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code TEXT; v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid() AND permission = 'manage') THEN
        RAISE EXCEPTION 'Add an athlete before inviting fans.';
    END IF;
    IF char_length(trim(COALESCE(p_name, ''))) = 0 THEN RAISE EXCEPTION 'Add their name first.'; END IF;
    IF (SELECT count(*) FROM fans WHERE owner_id = auth.uid()) >= 100 THEN
        RAISE EXCEPTION 'You''ve reached 100 fans. Remove one to invite someone new.';
    END IF;
    LOOP
        v_code := array_to_string(ARRAY(
            SELECT substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1)
            FROM generate_series(1, 8)), '');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM fans WHERE invite_code = v_code);
    END LOOP;
    INSERT INTO fans (owner_id, name, invite_code) VALUES (auth.uid(), left(trim(p_name), 60), v_code)
    RETURNING id INTO v_id;
    RETURN json_build_object('id', v_id, 'code', v_code);
END;
$$;
GRANT EXECUTE ON FUNCTION create_fan_invite(TEXT) TO authenticated;

-- ── Public: who invited me? (first names only) ──
CREATE OR REPLACE FUNCTION get_fan_invite(p_code TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT json_build_object(
        'guest_name', split_part(trim(f.name), ' ', 1),
        'athlete_first_name', (SELECT string_agg(a.first_name, ' & ' ORDER BY a.first_name)
                                 FROM athletes a WHERE a.id IN (SELECT fan_athlete_ids(f.owner_id))),
        'joined', f.fan_user_id IS NOT NULL
    )
    FROM fans f
    WHERE f.invite_code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'))
      AND char_length(f.invite_code) = 8
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_fan_invite(TEXT) TO anon, authenticated;

-- ── Fan: join with a code (one account per code) ──
CREATE OR REPLACE FUNCTION accept_fan_invite(p_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fan fans%ROWTYPE; v_name TEXT; v_has_own BOOLEAN;
    v_clean TEXT := upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT * INTO v_fan FROM fans WHERE invite_code = v_clean AND char_length(v_clean) = 8;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'That fan code isn''t valid. Check the 8 letters and numbers in your invite text.');
    END IF;
    IF v_fan.owner_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'That''s your own invite. Send it to your fan instead.');
    END IF;
    IF v_fan.fan_user_id IS NOT NULL AND v_fan.fan_user_id <> auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'This invite was already used. Ask the family for a new one.');
    END IF;
    UPDATE fans SET fan_user_id = auth.uid(), joined_at = COALESCE(joined_at, now()) WHERE id = v_fan.id;

    v_has_own := EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid())
              OR EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
              OR EXISTS (SELECT 1 FROM athletes WHERE user_id = auth.uid());
    IF NOT v_has_own THEN
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'fan')
        ON CONFLICT (id) DO UPDATE SET role = 'fan';
    END IF;
    SELECT string_agg(a.first_name, ' & ' ORDER BY a.first_name) INTO v_name
      FROM athletes a WHERE a.id IN (SELECT fan_athlete_ids(v_fan.owner_id));
    RETURN json_build_object('success', true, 'athlete_first_name', v_name, 'fan_only', NOT v_has_own);
END;
$$;
GRANT EXECUTE ON FUNCTION accept_fan_invite(TEXT) TO authenticated;

-- ── Fan app: tournaments (with the latest update) ──
DROP FUNCTION IF EXISTS my_fan_family();
CREATE FUNCTION my_fan_family()
RETURNS TABLE (
    tournament_id UUID, name TEXT, start_date DATE, end_date DATE, location_city TEXT,
    venues JSONB, streaming_links JSONB, ticket_link TEXT, schedule_link TEXT,
    default_stream_url TEXT, team_name TEXT, athlete_id UUID, athlete_first_name TEXT,
    latest_update TEXT, latest_update_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT ON (t.start_date, t.id) t.id, t.name, t.start_date, t.end_date, t.location_city,
           to_jsonb(t.venues), to_jsonb(t.streaming_links), t.ticket_link, t.schedule_link,
           s.default_stream_url, s.team_name, a.id, a.first_name, u.message, u.created_at
    FROM fans f
    CROSS JOIN LATERAL fan_athlete_ids(f.owner_id) AS fa(athlete_id)
    JOIN athletes a ON a.id = fa.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN tournaments t ON t.season_id = s.id
    LEFT JOIN LATERAL (SELECT message, created_at FROM tournament_updates tu
                       WHERE tu.tournament_id = t.id ORDER BY created_at DESC LIMIT 1) u ON true
    WHERE f.fan_user_id = auth.uid() AND t.end_date >= CURRENT_DATE
    ORDER BY t.start_date, t.id;
$$;
GRANT EXECUTE ON FUNCTION my_fan_family() TO authenticated;

-- ── Fan app: upcoming games and team events ──
CREATE OR REPLACE FUNCTION my_fan_games()
RETURNS TABLE (
    id UUID, name TEXT, date DATE, "time" TEXT, venue_name TEXT, address TEXT, event_type TEXT,
    opponent TEXT, home_away TEXT, team_name TEXT, athlete_id UUID, athlete_first_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT e.id, e.name, e.date, e.time::text, e.venue_name, e.address, e.event_type::text,
           e.opponent, e.home_away::text, s.team_name, a.id, a.first_name
    FROM fans f
    CROSS JOIN LATERAL fan_athlete_ids(f.owner_id) AS fa(athlete_id)
    JOIN athletes a ON a.id = fa.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN team_events e ON e.season_id = s.id
    WHERE f.fan_user_id = auth.uid() AND e.date >= CURRENT_DATE AND e.event_type::text <> 'practice';
$$;
GRANT EXECUTE ON FUNCTION my_fan_games() TO authenticated;

CREATE OR REPLACE FUNCTION my_followed_athletes()
RETURNS TABLE (athlete_id UUID, first_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT a.id, a.first_name
    FROM fans f
    CROSS JOIN LATERAL fan_athlete_ids(f.owner_id) AS fa(athlete_id)
    JOIN athletes a ON a.id = fa.athlete_id
    WHERE f.fan_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_followed_athletes() TO authenticated;

-- A fan stops following (from fan settings).
CREATE OR REPLACE FUNCTION leave_fan_family(p_athlete_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM fans WHERE fan_user_id = auth.uid()
       AND (p_athlete_id IS NULL OR p_athlete_id IN (SELECT fan_athlete_ids(owner_id)));
$$;
GRANT EXECUTE ON FUNCTION leave_fan_family(UUID) TO authenticated;

-- ── Pushes (notify-fans, lesson-reminders job) now read fans ──
CREATE OR REPLACE FUNCTION tournament_fan_user_ids(p_tournament_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT f.fan_user_id
    FROM tournaments t JOIN seasons s ON s.id = t.season_id
    JOIN fans f ON f.fan_user_id IS NOT NULL
    WHERE t.id = p_tournament_id AND s.athlete_id IN (SELECT fan_athlete_ids(f.owner_id));
$$;
REVOKE ALL ON FUNCTION tournament_fan_user_ids(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION athlete_fan_user_ids(p_athlete_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT f.fan_user_id FROM fans f
    WHERE f.fan_user_id IS NOT NULL AND p_athlete_id IN (SELECT fan_athlete_ids(f.owner_id));
$$;
REVOKE ALL ON FUNCTION athlete_fan_user_ids(UUID) FROM PUBLIC, anon, authenticated;

-- ── Clean slate: remove the old Guests data ──
DELETE FROM tournament_guests;
DELETE FROM guests;
-- Fan accounts stay fans: they see an empty fan home with a box for their new code.

SELECT (SELECT count(*) FROM guests) AS guests_left, (SELECT count(*) FROM fans) AS fans;
