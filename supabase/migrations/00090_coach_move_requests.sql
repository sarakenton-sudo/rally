-- Coach's pending family reschedule requests, with who and what. Coaches
-- can't read athletes/profiles directly (RLS), so names come from here.
CREATE OR REPLACE FUNCTION coach_move_requests()
RETURNS TABLE (
    booking_id UUID, athlete_name TEXT, parent_name TEXT,
    current_starts_at TIMESTAMPTZ, proposed_starts_at TIMESTAMPTZ,
    proposed_facility TEXT, reason TEXT, proposed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT b.id,
           trim(a.first_name || ' ' || COALESCE(a.last_name, '')),
           COALESCE(NULLIF(cc.client_parent_name, ''), up.display_name),
           cur.starts_at, nxt.starts_at, f.label, b.proposal_reason, b.proposed_at
    FROM bookings b
    JOIN athletes a ON a.id = b.athlete_id
    JOIN slots cur ON cur.id = b.slot_id
    JOIN slots nxt ON nxt.id = b.proposed_slot_id
    LEFT JOIN facilities f ON f.id = nxt.facility_id
    LEFT JOIN user_profiles up ON up.id = b.parent_user_id
    LEFT JOIN coach_connections cc ON cc.coach_id = b.coach_id AND cc.parent_user_id = b.parent_user_id
    WHERE b.coach_id = my_coach_id()
      AND b.status = 'confirmed'
      AND b.proposed_by = 'parent'
      AND nxt.starts_at > now()
    ORDER BY b.proposed_at;
$$;
GRANT EXECUTE ON FUNCTION coach_move_requests() TO authenticated;
