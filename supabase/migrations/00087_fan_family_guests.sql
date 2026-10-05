-- ============================================================
-- Fix 00086: the app creates guests at the FAMILY level (guests.user_id,
-- athlete_id NULL), so fan invites must work without an athlete. A guest
-- with no athlete follows every athlete the inviting family manages.
-- Co-parents can invite guests added by the other parent.
-- ============================================================

-- Athletes a guest follows: their own athlete, else the family's athletes.
CREATE OR REPLACE FUNCTION guest_athlete_ids(p_guest guests)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_guest.athlete_id WHERE p_guest.athlete_id IS NOT NULL
    UNION
    SELECT aa.athlete_id FROM admin_athletes aa
     WHERE p_guest.athlete_id IS NULL AND aa.admin_id = p_guest.user_id;
$$;
REVOKE ALL ON FUNCTION guest_athlete_ids(guests) FROM PUBLIC, anon, authenticated;

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
    -- The family that owns the guest: the parent who added them, or a co-parent sharing an athlete.
    IF NOT FOUND OR NOT (
        v_guest.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM guest_athlete_ids(v_guest) x WHERE x IN (SELECT my_athlete_ids()))
    ) THEN
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

-- Public greeting: "Avery" or "Avery & Drue".
CREATE OR REPLACE FUNCTION get_fan_invite(p_code TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'guest_name', split_part(trim(g.name), ' ', 1),
        'athlete_first_name', (SELECT string_agg(a.first_name, ' & ' ORDER BY a.first_name)
                                 FROM athletes a WHERE a.id IN (SELECT guest_athlete_ids(g))),
        'joined', g.invite_status = 'joined'
    )
    FROM guests g
    WHERE g.invite_code = upper(regexp_replace(COALESCE(p_code, ''), '[^a-zA-Z0-9]', '', 'g'))
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_fan_invite(TEXT) TO anon, authenticated;

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

    v_has_own := EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid())
              OR EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
              OR EXISTS (SELECT 1 FROM athletes WHERE user_id = auth.uid());
    IF NOT v_has_own THEN
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'fan')
        ON CONFLICT (id) DO UPDATE SET role = 'fan';
    END IF;

    SELECT string_agg(a.first_name, ' & ' ORDER BY a.first_name) INTO v_name
      FROM athletes a WHERE a.id IN (SELECT guest_athlete_ids(v_guest));
    RETURN json_build_object('success', true, 'athlete_first_name', v_name, 'fan_only', NOT v_has_own);
END;
$$;
GRANT EXECUTE ON FUNCTION accept_fan_invite(TEXT) TO authenticated;

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
    SELECT DISTINCT t.id, t.name, t.start_date, t.end_date, t.location_city,
           to_jsonb(t.venues), to_jsonb(t.streaming_links), t.ticket_link, t.schedule_link,
           s.default_stream_url, s.team_name, a.id, a.first_name
    FROM guests g
    CROSS JOIN LATERAL guest_athlete_ids(g) AS ga(athlete_id)
    JOIN athletes a ON a.id = ga.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN tournaments t ON t.season_id = s.id
    WHERE g.fan_user_id = auth.uid()
      AND t.end_date >= CURRENT_DATE
    ORDER BY t.start_date, a.first_name;
$$;
GRANT EXECUTE ON FUNCTION my_fan_family() TO authenticated;

CREATE OR REPLACE FUNCTION my_followed_athletes()
RETURNS TABLE (athlete_id UUID, first_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT a.id, a.first_name
    FROM guests g
    CROSS JOIN LATERAL guest_athlete_ids(g) AS ga(athlete_id)
    JOIN athletes a ON a.id = ga.athlete_id
    WHERE g.fan_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_followed_athletes() TO authenticated;
