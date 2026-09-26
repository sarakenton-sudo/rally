-- ============================================================
-- Coaching & Lessons Module — coach schedule + calendar feed
--
-- 1. coach_calendar_feeds: one secret token per coach. Lives in its own
--    owner-only table (NOT a coaches column) because connected parents can
--    read coaches rows — the token must never reach them.
-- 2. coach_schedule_items(): internal — one row per slot that has a live
--    booking or pending request, with athletes/parents aggregated. Used by
--    both the in-app Schedule screen and the iCal feed edge function.
-- 3. get_coach_schedule(): authenticated wrapper scoped to my_coach_id().
-- 4. get_my_calendar_token() / regenerate_my_calendar_token().
-- ============================================================

CREATE TABLE IF NOT EXISTS coach_calendar_feeds (
    coach_id   UUID PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,
    token      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coach_calendar_feeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Calendar feed read by owning coach" ON coach_calendar_feeds;
CREATE POLICY "Calendar feed read by owning coach"
    ON coach_calendar_feeds FOR SELECT
    USING (coach_id = my_coach_id());

-- ------------------------------------------------------------
-- coach_schedule_items: slots in [p_from, p_to) with confirmed bookings or
-- pending requests. Open slots with nobody on them are omitted.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION coach_schedule_items(p_coach_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    slot_id        UUID,
    starts_at      TIMESTAMPTZ,
    ends_at        TIMESTAMPTZ,
    seats_total    INT,
    facility_label TEXT,
    facility_address TEXT,
    status         TEXT,      -- 'booked' if any confirmed booking, else 'pending'
    attendees      JSONB      -- [{kind, id, status, athlete_name, parent_name, session_type, session_kind, notes, film_links}]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH entries AS (
        SELECT b.slot_id, 'booking'::text AS kind, b.id, b.status,
               b.athlete_id, b.parent_user_id, r.session_type_id, r.notes, r.film_links
        FROM bookings b
        JOIN booking_requests r ON r.id = b.request_id
        WHERE b.coach_id = p_coach_id AND b.status IN ('confirmed', 'completed', 'no_show')
        UNION ALL
        SELECT r.slot_id, 'request', r.id, r.status,
               r.athlete_id, r.parent_user_id, r.session_type_id, r.notes, r.film_links
        FROM booking_requests r
        WHERE r.coach_id = p_coach_id AND r.status = 'requested'
    )
    SELECT s.id, s.starts_at, s.ends_at, s.seats_total,
           f.label, f.address,
           CASE WHEN bool_or(e.kind = 'booking') THEN 'booked' ELSE 'pending' END,
           jsonb_agg(jsonb_build_object(
               'kind', e.kind,
               'id', e.id,
               'status', e.status,
               'athlete_name', COALESCE(NULLIF(trim(a.first_name || ' ' || COALESCE(a.last_name, '')), ''), 'Athlete'),
               'parent_name', up.display_name,
               'session_type', st.name,
               'session_kind', st.kind,
               'notes', e.notes,
               'film_links', e.film_links
           ) ORDER BY e.kind, a.first_name)
    FROM slots s
    JOIN entries e ON e.slot_id = s.id
    LEFT JOIN facilities f ON f.id = s.facility_id
    LEFT JOIN athletes a ON a.id = e.athlete_id
    LEFT JOIN user_profiles up ON up.id = e.parent_user_id
    LEFT JOIN session_types st ON st.id = e.session_type_id
    WHERE s.coach_id = p_coach_id
      AND s.starts_at >= p_from AND s.starts_at < p_to
    GROUP BY s.id, f.label, f.address
    ORDER BY s.starts_at;
$$;

-- Internal only: callable by the service role (feed edge fn), not by clients.
REVOKE EXECUTE ON FUNCTION coach_schedule_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_schedule_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION get_coach_schedule(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT to_jsonb(i) FROM coach_schedule_items(my_coach_id(), p_from, p_to) i
    WHERE my_coach_id() IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION get_coach_schedule(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Returns the caller's feed token, creating it on first use.
CREATE OR REPLACE FUNCTION get_my_calendar_token()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach UUID := my_coach_id();
    v_token UUID;
BEGIN
    IF v_coach IS NULL THEN
        RAISE EXCEPTION 'not a coach';
    END IF;
    INSERT INTO coach_calendar_feeds (coach_id) VALUES (v_coach)
        ON CONFLICT (coach_id) DO NOTHING;
    SELECT token INTO v_token FROM coach_calendar_feeds WHERE coach_id = v_coach;
    RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_calendar_token() TO authenticated;

-- Invalidates the old link (e.g. it was shared by mistake).
CREATE OR REPLACE FUNCTION regenerate_my_calendar_token()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach UUID := my_coach_id();
    v_token UUID := gen_random_uuid();
BEGIN
    IF v_coach IS NULL THEN
        RAISE EXCEPTION 'not a coach';
    END IF;
    INSERT INTO coach_calendar_feeds (coach_id, token) VALUES (v_coach, v_token)
        ON CONFLICT (coach_id) DO UPDATE SET token = EXCLUDED.token, created_at = now();
    RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION regenerate_my_calendar_token() TO authenticated;
