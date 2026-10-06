-- ============================================================
-- Guests on the app (fans) get tournament updates by push instead of SMS.
-- A parent posts a short update on a tournament; every fan following that
-- athlete gets a push, and the latest update shows on the tournament in
-- the fan app (for anyone who missed the push).
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_updates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    message       TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280),
    created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_updates_t ON tournament_updates(tournament_id, created_at DESC);
ALTER TABLE tournament_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Family reads tournament updates" ON tournament_updates;
CREATE POLICY "Family reads tournament updates" ON tournament_updates FOR SELECT
    USING (tournament_id IN (SELECT t.id FROM tournaments t JOIN seasons s ON s.id = t.season_id
                              WHERE s.athlete_id IN (SELECT my_athlete_ids())));
-- Writes go through post_tournament_update().

-- Fans (guests on the app) who follow this tournament's athlete.
CREATE OR REPLACE FUNCTION tournament_fan_user_ids(p_tournament_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT g.fan_user_id
    FROM tournaments t
    JOIN seasons s ON s.id = t.season_id
    JOIN guests g ON g.fan_user_id IS NOT NULL
    WHERE t.id = p_tournament_id
      AND s.athlete_id IN (SELECT guest_athlete_ids(g));
$$;
REVOKE ALL ON FUNCTION tournament_fan_user_ids(UUID) FROM PUBLIC, anon, authenticated;

-- Parent (manage) posts an update; returns how many fans follow. Max 6/day per tournament.
CREATE OR REPLACE FUNCTION post_tournament_update(p_tournament_id UUID, p_message TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_count INT; v_today INT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM tournaments t JOIN seasons s ON s.id = t.season_id
        JOIN admin_athletes aa ON aa.athlete_id = s.athlete_id
        WHERE t.id = p_tournament_id AND aa.admin_id = auth.uid() AND aa.permission = 'manage'
    ) THEN RAISE EXCEPTION 'tournament not found'; END IF;
    IF char_length(trim(COALESCE(p_message, ''))) = 0 THEN RAISE EXCEPTION 'Write an update first'; END IF;
    SELECT count(*) INTO v_today FROM tournament_updates WHERE tournament_id = p_tournament_id AND created_at > now() - interval '1 day';
    IF v_today >= 6 THEN RAISE EXCEPTION 'You''ve sent 6 updates for this tournament today. Try again tomorrow.'; END IF;
    INSERT INTO tournament_updates (tournament_id, message, created_by) VALUES (p_tournament_id, left(trim(p_message), 280), auth.uid())
    RETURNING id INTO v_id;
    SELECT count(*) INTO v_count FROM tournament_fan_user_ids(p_tournament_id);
    RETURN jsonb_build_object('update_id', v_id, 'fans', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION post_tournament_update(UUID, TEXT) TO authenticated;

-- Fan app: add the latest update to each tournament (return type changes → drop first).
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
           s.default_stream_url, s.team_name, a.id, a.first_name,
           u.message, u.created_at
    FROM guests g
    CROSS JOIN LATERAL guest_athlete_ids(g) AS ga(athlete_id)
    JOIN athletes a ON a.id = ga.athlete_id
    JOIN seasons s ON s.athlete_id = a.id
    JOIN tournaments t ON t.season_id = s.id
    LEFT JOIN LATERAL (SELECT message, created_at FROM tournament_updates tu
                       WHERE tu.tournament_id = t.id ORDER BY created_at DESC LIMIT 1) u ON true
    WHERE g.fan_user_id = auth.uid()
      AND t.end_date >= CURRENT_DATE
    ORDER BY t.start_date, t.id;
$$;
GRANT EXECUTE ON FUNCTION my_fan_family() TO authenticated;

-- ------------------------------------------------------------
-- Automatic guest pushes (run by the 15-minute lesson-reminders job):
--   game day (each morning of a tournament), new tournaments on the
--   schedule, and the live stream link when it shows up.
-- These columns record what was already sent so nothing repeats.
-- ------------------------------------------------------------
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS fan_gameday_sent_on DATE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS fan_stream_sent_url TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS fan_new_sent_at TIMESTAMPTZ;
-- Everything already on schedules counts as announced (no flood on day one).
UPDATE tournaments SET fan_new_sent_at = now() WHERE fan_new_sent_at IS NULL;

-- Fans following an athlete (for one push about several new tournaments).
CREATE OR REPLACE FUNCTION athlete_fan_user_ids(p_athlete_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT g.fan_user_id FROM guests g
    WHERE g.fan_user_id IS NOT NULL AND p_athlete_id IN (SELECT guest_athlete_ids(g));
$$;
REVOKE ALL ON FUNCTION athlete_fan_user_ids(UUID) FROM PUBLIC, anon, authenticated;
