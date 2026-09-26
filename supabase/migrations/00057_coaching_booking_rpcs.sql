-- ============================================================
-- Coaching & Lessons Module — Server-authoritative booking RPCs (PR 3b)
-- request_booking / accept_booking_request / decline_booking_request /
-- cancel_booking / expire_booking_requests / get_coach_request_detail
-- See docs/coaching-build-spec.md §2.4
--
-- These own every booking state transition. Clients never write booking/slot
-- state directly (00056 has read-only RLS). Stripe money moves are layered on
-- top by edge functions (authorize after request, capture after accept, etc.).
-- ============================================================

-- ------------------------------------------------------------
-- request_booking: parent reserves a slot. Locks the slot row, enforces
-- availability, forms the coach<->parent connection, creates the request.
-- Returns the request so the edge fn can create the PaymentIntent.
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

    -- Athlete must belong to the caller.
    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete % is not accessible to this user', p_athlete_id;
    END IF;

    -- Lock the slot to serialize concurrent requests on the last seat.
    SELECT * INTO v_slot FROM slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot not found';
    END IF;
    IF v_slot.status <> 'open' OR v_slot.seats_taken >= v_slot.seats_total THEN
        RAISE EXCEPTION 'slot unavailable';
    END IF;

    -- Session type must belong to the same coach as the slot.
    SELECT * INTO v_stype FROM session_types WHERE id = p_session_type_id;
    IF NOT FOUND OR v_stype.coach_id <> v_slot.coach_id OR NOT v_stype.is_active THEN
        RAISE EXCEPTION 'invalid session type for this slot';
    END IF;

    -- Reserve the seat. Mark slot 'held' once full (single-seat in v1 => held now).
    UPDATE slots
       SET seats_taken = seats_taken + 1,
           status = CASE WHEN seats_taken + 1 >= seats_total THEN 'held' ELSE status END
     WHERE id = p_slot_id;

    -- Form the roster connection if it doesn't exist yet (spec §7.5).
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
-- accept_booking_request: coach accepts. Books the slot, creates the booking.
-- Edge fn (capture-booking-intent) then captures the PaymentIntent and fills fees.
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
    -- Owning coach must accept. The service role (auth.uid() IS NULL) is the trusted
    -- exception: the capture edge fn auto-accepts instant-book requests this way.
    IF auth.uid() IS NOT NULL AND v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;
    IF v_req.status <> 'requested' THEN
        RAISE EXCEPTION 'request is % (expected requested)', v_req.status;
    END IF;

    SELECT price_cents INTO v_price FROM session_types WHERE id = v_req.session_type_id;

    UPDATE booking_requests SET status = 'accepted' WHERE id = p_request_id;
    UPDATE slots SET status = 'booked' WHERE id = v_req.slot_id;

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

-- ------------------------------------------------------------
-- decline_booking_request: coach declines (or system marks expired). Releases the slot.
-- Edge fn (release-booking-intent) then cancels the PaymentIntent authorization.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_booking_request(
    p_request_id UUID,
    p_reason     TEXT DEFAULT 'declined'   -- 'declined' | 'expired'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req booking_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    -- Coach may decline; the expiry sweep passes p_reason='expired' as definer.
    IF p_reason = 'declined' AND v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;
    IF v_req.status <> 'requested' THEN
        RAISE EXCEPTION 'request is % (expected requested)', v_req.status;
    END IF;

    UPDATE booking_requests
       SET status = CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'declined' END
     WHERE id = p_request_id;

    -- Release the held seat.
    UPDATE slots
       SET seats_taken = GREATEST(seats_taken - 1, 0),
           status = CASE WHEN status = 'held' THEN 'open' ELSE status END
     WHERE id = v_req.slot_id;

    RETURN jsonb_build_object(
        'request_id', v_req.id,
        'payment_intent_id', v_req.payment_intent_id,
        'status', CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'declined' END,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- cancel_booking: parent or coach cancels a confirmed booking. Releases the slot.
-- Edge fn (refund-booking) computes + issues the refund per cancellation policy.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk    bookings%ROWTYPE;
    v_actor TEXT;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking not found';
    END IF;

    IF v_bk.coach_id = my_coach_id() THEN
        v_actor := 'coach';
    ELSIF v_bk.parent_user_id = auth.uid() THEN
        v_actor := 'parent';
    ELSE
        RAISE EXCEPTION 'not authorized to cancel this booking';
    END IF;

    IF v_bk.status <> 'confirmed' THEN
        RAISE EXCEPTION 'booking is % (expected confirmed)', v_bk.status;
    END IF;

    UPDATE bookings SET status = 'cancelled' WHERE id = p_booking_id;
    UPDATE booking_requests SET status = 'cancelled' WHERE id = v_bk.request_id;

    -- Free the slot back to open.
    UPDATE slots
       SET seats_taken = GREATEST(seats_taken - 1, 0),
           status = 'open'
     WHERE id = v_bk.slot_id;

    RETURN jsonb_build_object(
        'booking_id', v_bk.id,
        'cancelled_by', v_actor,
        'stripe_charge_id', v_bk.stripe_charge_id,
        'payment_status', v_bk.payment_status,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- expire_booking_requests: cron sweep. Expires overdue requests, releases slots,
-- returns the expired set (with PI ids) so the caller releases authorizations.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_booking_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired JSONB;
BEGIN
    WITH due AS (
        SELECT id, slot_id, payment_intent_id
        FROM booking_requests
        WHERE status = 'requested' AND expires_at < now()
        FOR UPDATE SKIP LOCKED
    ),
    upd_req AS (
        UPDATE booking_requests br SET status = 'expired'
        FROM due WHERE br.id = due.id
        RETURNING br.id, br.payment_intent_id
    ),
    upd_slot AS (
        UPDATE slots s
           SET seats_taken = GREATEST(s.seats_taken - 1, 0),
               status = CASE WHEN s.status = 'held' THEN 'open' ELSE s.status END
        FROM due WHERE s.id = due.slot_id
        RETURNING s.id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'request_id', id, 'payment_intent_id', payment_intent_id)), '[]'::jsonb)
      INTO v_expired
      FROM upd_req;

    RETURN jsonb_build_object('expired', v_expired, 'success', true);
END;
$$;

-- ------------------------------------------------------------
-- get_coach_request_detail: owning coach reads the athlete profile + notes + film
-- for a request. This is the data-minimization boundary (spec §7.12) — the coach
-- has no direct read grant on athletes; profile fields flow only through here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_request_detail(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req booking_requests%ROWTYPE;
    v_out JSONB;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    IF v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;

    SELECT jsonb_build_object(
        'request_id', v_req.id,
        'status', v_req.status,
        'notes', v_req.notes,
        'film_links', v_req.film_links,
        'athlete', jsonb_build_object(
            'first_name', a.first_name,
            'last_name', a.last_name,
            'grad_year', a.grad_year,
            'positions', a.positions,
            'level', a.level,
            'club_team', a.club_team,
            'height_inches', a.height_inches,
            'goals', a.goals
        )
    ) INTO v_out
    FROM athletes a WHERE a.id = v_req.athlete_id;

    RETURN v_out;
END;
$$;

-- Grants: authenticated callers; authorization is enforced inside each function.
GRANT EXECUTE ON FUNCTION request_booking(UUID, UUID, UUID, TEXT, TEXT, TEXT[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_booking_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_booking_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_coach_request_detail(UUID) TO authenticated;
-- expire_booking_requests is called by the scheduled job via service role only.
