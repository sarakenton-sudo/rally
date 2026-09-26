-- ============================================================
-- Coaching & Lessons Module — coach client roster
--
-- A "client" is a coach_connections row (one family). The athletes shown are
-- the ones the family has actually brought to this coach (booking requests,
-- plus connection.athlete_id) — never the family's other kids.
-- Parent contact (name + account email) is shared with a coach the family
-- connected to themselves.
-- ============================================================

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
        'grad_year', a.grad_year,
        'positions', a.positions,
        'level', a.level,
        'club_team', a.club_team,
        'height_inches', a.height_inches,
        'goals', a.goals
    ) ORDER BY a.first_name), '[]'::jsonb)
    FROM athletes a
    WHERE a.id = p_athlete
       OR a.id IN (SELECT athlete_id FROM booking_requests
                    WHERE coach_id = p_coach_id AND parent_user_id = p_parent);
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
        'parent_name', up.display_name,
        'parent_email', u.email,
        'athletes', coach_client_athletes(cc.coach_id, cc.parent_user_id, cc.athlete_id),
        'group_ids', COALESCE((SELECT array_agg(m.group_id) FROM client_group_members m
                               WHERE m.connection_id = cc.id), '{}'::uuid[]),
        'lessons_booked', (SELECT count(*) FROM bookings b
                           WHERE b.coach_id = cc.coach_id AND b.parent_user_id = cc.parent_user_id
                             AND b.status IN ('confirmed', 'completed')),
        'pending_requests', (SELECT count(*) FROM booking_requests r
                             WHERE r.coach_id = cc.coach_id AND r.parent_user_id = cc.parent_user_id
                               AND r.status = 'requested'),
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

-- get_coach_clients (used by Client groups + slot targeting) labelled every
-- family "Client" when connected by code (no athlete_id). Fall back to the
-- athletes they've booked, then the parent's name. Same signature.
CREATE OR REPLACE FUNCTION get_coach_clients()
RETURNS TABLE (connection_id UUID, athlete_id UUID, athlete_name TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT cc.id,
           cc.athlete_id,
           COALESCE(
               NULLIF((SELECT string_agg(DISTINCT x->>'first_name', ' & ')
                       FROM jsonb_array_elements(coach_client_athletes(cc.coach_id, cc.parent_user_id, cc.athlete_id)) x), ''),
               NULLIF(trim(up.display_name), ''),
               split_part(u.email, '@', 1),
               'Client'
           ),
           cc.status
    FROM coach_connections cc
    LEFT JOIN user_profiles up ON up.id = cc.parent_user_id
    LEFT JOIN auth.users u ON u.id = cc.parent_user_id
    WHERE cc.coach_id = my_coach_id()
    ORDER BY cc.created_at;
$$;
GRANT EXECUTE ON FUNCTION get_coach_clients() TO authenticated;
