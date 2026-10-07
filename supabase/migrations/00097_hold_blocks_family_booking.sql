-- ============================================================
-- Fix for 00096: families could still request a time the coach was holding
-- (request_booking only refused blocked or full times). Refuse held ones.
-- ============================================================
CREATE OR REPLACE FUNCTION request_booking(
    p_slot_id         UUID,
    p_session_type_id UUID,
    p_athlete_id      UUID,
    p_terms_version   TEXT,
    p_notes           TEXT DEFAULT NULL,
    p_film_links      TEXT[] DEFAULT '{}',
    p_response_hours  INT DEFAULT 48
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent     UUID := auth.uid();
    v_slot       slots%ROWTYPE;
    v_stype      session_types%ROWTYPE;
    v_request_id UUID;
BEGIN
    IF v_parent IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete % is not accessible to this user', p_athlete_id;
    END IF;

    -- Lock the slot to serialize concurrent requests on the last seat.
    SELECT * INTO v_slot FROM slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot not found';
    END IF;
    -- A time the coach is holding for someone can't be booked by families.
    IF v_slot.held_for IS NOT NULL THEN
        RAISE EXCEPTION 'SLOT_UNAVAILABLE: That time is being held. Pick another time.';
    END IF;
    IF v_slot.status = 'blocked' OR v_slot.seats_taken >= v_slot.seats_total THEN
        RAISE EXCEPTION 'slot unavailable';
    END IF;

    -- Session type must belong to the same coach and be active.
    SELECT * INTO v_stype FROM session_types WHERE id = p_session_type_id;
    IF NOT FOUND OR v_stype.coach_id <> v_slot.coach_id OR NOT v_stype.is_active THEN
        RAISE EXCEPTION 'invalid session type for this slot';
    END IF;

    -- ...and must be eligible for this slot (empty array => any active type allowed).
    IF array_length(v_slot.eligible_session_type_ids, 1) IS NOT NULL
       AND NOT (p_session_type_id = ANY (v_slot.eligible_session_type_ids)) THEN
        RAISE EXCEPTION 'session type not allowed for this slot';
    END IF;

    -- Take a seat. Mark full when no seats remain (works for 1 and N spots).
    UPDATE slots
       SET seats_taken = seats_taken + 1,
           status = CASE WHEN seats_taken + 1 >= seats_total THEN 'held' ELSE 'open' END
     WHERE id = p_slot_id;

    INSERT INTO coach_connections (coach_id, parent_user_id, athlete_id, status)
    VALUES (v_slot.coach_id, v_parent, p_athlete_id, 'active')
    ON CONFLICT (coach_id, parent_user_id) DO NOTHING;

    INSERT INTO booking_requests (
        coach_id, parent_user_id, athlete_id, session_type_id, slot_id,
        notes, film_links, accepted_terms_version, expires_at
    )
    VALUES (
        v_slot.coach_id, v_parent, p_athlete_id, p_session_type_id, p_slot_id,
        p_notes, COALESCE(p_film_links, '{}'),
        p_terms_version, now() + make_interval(hours => p_response_hours)
    )
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'request_id', v_request_id,
        'coach_id', v_slot.coach_id,
        'price_cents', v_stype.price_cents,
        'booking_mode', v_stype.booking_mode,
        'success', true
    );
END;
$$;

