-- ============================================================
-- Coaching & Lessons Module — flexible slots + multi-seat (PR 5c)
-- A slot is a time window bookable as one of several eligible session types
-- ("private OR semi", or "anything"), with a spot count (clinic/camp). Each
-- booking takes one seat at the chosen type's price; remaining = total - taken.
-- ============================================================

-- Eligible session types a parent may book this slot as. Empty array = "any
-- active session type of this coach" (interpreted in request_booking + the UI).
ALTER TABLE slots
    ADD COLUMN IF NOT EXISTS eligible_session_type_ids UUID[] NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- request_booking: now validates the chosen type is eligible for the slot.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- accept_booking_request: for multi-seat slots, accepting ONE booking must not
-- mark the whole slot booked — only mark booked when no seats remain.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_booking_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req        booking_requests%ROWTYPE;
    v_price      INT;
    v_booking_id UUID;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    IF auth.uid() IS NOT NULL AND v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;
    IF v_req.status <> 'requested' THEN
        RAISE EXCEPTION 'request is % (expected requested)', v_req.status;
    END IF;

    SELECT price_cents INTO v_price FROM session_types WHERE id = v_req.session_type_id;

    UPDATE booking_requests SET status = 'accepted' WHERE id = p_request_id;
    -- Only fully book the slot when its seats are all taken; partially-filled
    -- clinic/camp slots stay 'open' so the remaining spots can still be booked.
    UPDATE slots
       SET status = CASE WHEN seats_taken >= seats_total THEN 'booked' ELSE 'open' END
     WHERE id = v_req.slot_id;

    INSERT INTO bookings (
        request_id, coach_id, parent_user_id, athlete_id, slot_id,
        price_cents, payment_status, status
    )
    VALUES (
        v_req.id, v_req.coach_id, v_req.parent_user_id, v_req.athlete_id, v_req.slot_id,
        v_price, 'authorized', 'confirmed'
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'payment_intent_id', v_req.payment_intent_id,
        'success', true
    );
END;
$$;
