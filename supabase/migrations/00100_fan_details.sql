-- ============================================================
-- Fan app details: team code (for buying tickets at the door/online), the
-- team (season) so fans can filter by team, and athlete photo + color.
-- Still no travel, lessons or logins.
-- ============================================================
DROP FUNCTION IF EXISTS my_fan_family();
CREATE FUNCTION my_fan_family()
RETURNS TABLE (
    tournament_id UUID, name TEXT, start_date DATE, end_date DATE, location_city TEXT,
    venues JSONB, streaming_links JSONB, ticket_link TEXT, schedule_link TEXT,
    default_stream_url TEXT, team_name TEXT, athlete_id UUID, athlete_first_name TEXT,
    latest_update TEXT, latest_update_at TIMESTAMPTZ,
    season_id UUID, team_code TEXT, athlete_photo_url TEXT, athlete_avatar_color TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT ON (t.start_date, t.id) t.id, t.name, t.start_date, t.end_date, t.location_city,
           to_jsonb(t.venues), to_jsonb(t.streaming_links), t.ticket_link, t.schedule_link,
           s.default_stream_url, s.team_name, a.id, a.first_name, u.message, u.created_at,
           s.id, s.team_code, a.photo_url, a.avatar_color
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

DROP FUNCTION IF EXISTS my_fan_games();
CREATE FUNCTION my_fan_games()
RETURNS TABLE (
    id UUID, name TEXT, date DATE, "time" TEXT, venue_name TEXT, address TEXT, event_type TEXT,
    opponent TEXT, home_away TEXT, team_name TEXT, athlete_id UUID, athlete_first_name TEXT,
    season_id UUID, notes TEXT, athlete_photo_url TEXT, athlete_avatar_color TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT e.id, e.name, e.date, e.time::text, e.venue_name, e.address, e.event_type::text,
           e.opponent, e.home_away::text, s.team_name, a.id, a.first_name,
           s.id, e.notes, a.photo_url, a.avatar_color
    FROM fans f
    CROSS JOIN LATERAL fan_athlete_ids(f.owner_id) AS fa(athlete_id)
    JOIN athletes a ON a.id = fa.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN team_events e ON e.season_id = s.id
    WHERE f.fan_user_id = auth.uid() AND e.date >= CURRENT_DATE AND e.event_type::text <> 'practice';
$$;
GRANT EXECUTE ON FUNCTION my_fan_games() TO authenticated;

DROP FUNCTION IF EXISTS my_followed_athletes();
CREATE FUNCTION my_followed_athletes()
RETURNS TABLE (athlete_id UUID, first_name TEXT, photo_url TEXT, avatar_color TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT a.id, a.first_name, a.photo_url, a.avatar_color
    FROM fans f
    CROSS JOIN LATERAL fan_athlete_ids(f.owner_id) AS fa(athlete_id)
    JOIN athletes a ON a.id = fa.athlete_id
    WHERE f.fan_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_followed_athletes() TO authenticated;
