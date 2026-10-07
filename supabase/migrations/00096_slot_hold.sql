-- ============================================================
-- Hold an open time for someone (a client, an invited family who hasn't
-- joined yet, or anyone by name) with a note, e.g. "waiting on Mom to
-- confirm". A held time can't be booked by families (status 'held'); the
-- coach books it with "Assign athlete" when ready, or releases it.
-- ============================================================
ALTER TABLE slots ADD COLUMN IF NOT EXISTS held_for  TEXT CHECK (held_for IS NULL OR char_length(held_for) <= 80);
ALTER TABLE slots ADD COLUMN IF NOT EXISTS hold_note TEXT CHECK (hold_note IS NULL OR char_length(hold_note) <= 200);
ALTER TABLE slots ADD COLUMN IF NOT EXISTS held_at   TIMESTAMPTZ;

-- The coach can book their own held time (families can't: request_booking
-- still needs status 'open').
CREATE OR REPLACE FUNCTION coach_create_booking(
    p_athlete_id      UUID,
    p_session_type_id UUID,
    p_slot_id         UUID DEFAULT NULL,     -- existing open slot, or…
    p_starts_at       TIMESTAMPTZ DEFAULT NULL,  -- …a new time
    p_ends_at         TIMESTAMPTZ DEFAULT NULL,
    p_facility_id     UUID DEFAULT NULL,
    p_notes           TEXT DEFAULT NULL,
    p_charge_in_app   BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach   UUID := my_coach_id();
    v_parent  UUID;
    v_conn    UUID;
    v_stype   session_types%ROWTYPE;
    v_slot    slots%ROWTYPE;
    v_req_id  UUID;
    v_bk_id   UUID;
BEGIN
    IF v_coach IS NULL THEN RAISE EXCEPTION 'not a coach'; END IF;

    SELECT br.parent_user_id INTO v_parent
      FROM booking_requests br
     WHERE br.coach_id = v_coach AND br.athlete_id = p_athlete_id
     ORDER BY br.created_at DESC LIMIT 1;
    IF v_parent IS NULL THEN
        RAISE EXCEPTION 'This athlete hasn''t booked with you yet — their family needs to request a first lesson so they can sign your terms.';
    END IF;
    SELECT id INTO v_conn FROM coach_connections WHERE coach_id = v_coach AND parent_user_id = v_parent;

    SELECT * INTO v_stype FROM session_types WHERE id = p_session_type_id AND coach_id = v_coach AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pick one of your active lesson types'; END IF;

    IF p_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM slots WHERE id = p_slot_id AND coach_id = v_coach FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'That time isn''t one of your slots'; END IF;
        IF v_slot.status NOT IN ('open', 'held') OR v_slot.seats_taken >= v_slot.seats_total THEN
            RAISE EXCEPTION 'That time is already full';
        END IF;
        IF array_length(v_slot.eligible_session_type_ids, 1) > 0 AND NOT (p_session_type_id = ANY (v_slot.eligible_session_type_ids)) THEN
            RAISE EXCEPTION 'That time isn''t open for this lesson type';
        END IF;
    ELSE
        IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
            RAISE EXCEPTION 'Pick a start and end time';
        END IF;
        IF p_facility_id IS NULL OR NOT EXISTS (SELECT 1 FROM facilities WHERE id = p_facility_id AND coach_id = v_coach) THEN
            RAISE EXCEPTION 'Pick one of your facilities';
        END IF;
        -- A private block for this family only (not shown on the booking page).
        INSERT INTO slots (coach_id, facility_id, session_type_id, eligible_session_type_ids, starts_at, ends_at,
                           status, seats_total, seats_taken, visibility, shared_with_connection_id)
        VALUES (v_coach, p_facility_id, p_session_type_id, ARRAY[p_session_type_id], p_starts_at, p_ends_at,
                'open', GREATEST(v_stype.capacity, 1), 0, 'individual', v_conn)
        RETURNING * INTO v_slot;
    END IF;

    -- Request row (already accepted). The booking_requests trigger enforces the
    -- coach agreement, the family's signed terms/release, and health info.
    INSERT INTO booking_requests (coach_id, parent_user_id, athlete_id, session_type_id, slot_id, notes,
                                  status, accepted_terms_version, expires_at)
    VALUES (v_coach, v_parent, p_athlete_id, p_session_type_id, v_slot.id, NULLIF(trim(p_notes), ''),
            'accepted', 'coach-booked', now())
    RETURNING id INTO v_req_id;

    -- Booking a held time uses up the hold.
    UPDATE slots
       SET seats_taken = seats_taken + 1,
           status = CASE WHEN seats_taken + 1 >= seats_total THEN 'booked' ELSE 'open' END,
           held_for = NULL, hold_note = NULL, held_at = NULL
     WHERE id = v_slot.id;

    INSERT INTO bookings (request_id, coach_id, parent_user_id, athlete_id, slot_id, price_cents, payment_status, status)
    VALUES (v_req_id, v_coach, v_parent, p_athlete_id, v_slot.id, v_stype.price_cents, 'pending', 'confirmed')
    RETURNING id INTO v_bk_id;

    -- Collect directly → no scheduled in-app charge.
    IF NOT p_charge_in_app THEN
        UPDATE bookings SET charge_due_at = NULL WHERE id = v_bk_id;
    END IF;

    RETURN jsonb_build_object('booking_id', v_bk_id, 'request_id', v_req_id, 'slot_id', v_slot.id);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_create_booking(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, BOOLEAN) TO authenticated;
