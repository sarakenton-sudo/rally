-- ============================================================
-- Coach Experience — Phase A "Run the week"
--  * coach sign-up fields (mobile, primary city); facility contact
--  * facility reservation status per availability block
--  * cash / off-platform payments recorded against a booking (ledger stays whole)
--  * coach cancel + reschedule with a reason for the parent
--  * schedule items carry payment + contact data for the weekly revenue view
-- ============================================================

ALTER TABLE coaches    ADD COLUMN IF NOT EXISTS phone        TEXT;
ALTER TABLE coaches    ADD COLUMN IF NOT EXISTS primary_city TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS contact      TEXT;

ALTER TABLE slots ADD COLUMN IF NOT EXISTS facility_status TEXT NOT NULL DEFAULT 'not_booked';
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_facility_status_check;
ALTER TABLE slots ADD CONSTRAINT slots_facility_status_check
    CHECK (facility_status IN ('reserved', 'requested', 'not_booked'));

-- payment_method already exists ('card'|'apple_pay'|'google_pay'|'ach'); off-platform
-- methods add 'cash' | 'venmo' | 'zelle' | 'other'.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_amount_cents INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_reason     TEXT;   -- coach's cancel/reschedule note

-- ------------------------------------------------------------
-- mark_booking_paid / mark_booking_unpaid — coach records an off-platform payment
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_booking_paid(p_booking_id UUID, p_method TEXT DEFAULT 'cash', p_amount_cents INT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN
        RAISE EXCEPTION 'not your booking';
    END IF;
    IF p_method NOT IN ('cash', 'venmo', 'zelle', 'other') THEN
        RAISE EXCEPTION 'unsupported payment method %', p_method;
    END IF;
    IF v_bk.stripe_charge_id IS NOT NULL THEN
        RAISE EXCEPTION 'this lesson was already paid through RallyHUB';
    END IF;

    UPDATE bookings
       SET payment_status = 'captured',
           payment_method = p_method,
           paid_at = now(),
           paid_amount_cents = COALESCE(p_amount_cents, v_bk.price_cents)
     WHERE id = p_booking_id;

    INSERT INTO payment_events (booking_id, request_id, type, amount_cents, raw)
    VALUES (v_bk.id, v_bk.request_id, 'offline_recorded', COALESCE(p_amount_cents, v_bk.price_cents),
            jsonb_build_object('method', p_method));
END;
$$;
GRANT EXECUTE ON FUNCTION mark_booking_paid(UUID, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION mark_booking_unpaid(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN
        RAISE EXCEPTION 'not your booking';
    END IF;
    IF v_bk.payment_method IS NULL OR v_bk.payment_method NOT IN ('cash', 'venmo', 'zelle', 'other') THEN
        RAISE EXCEPTION 'only off-platform payments can be undone here';
    END IF;

    UPDATE bookings
       SET payment_status = 'pending', payment_method = NULL, paid_at = NULL, paid_amount_cents = NULL
     WHERE id = p_booking_id;

    INSERT INTO payment_events (booking_id, request_id, type, amount_cents, raw)
    VALUES (v_bk.id, v_bk.request_id, 'offline_reversed', v_bk.paid_amount_cents, jsonb_build_object('method', v_bk.payment_method));
END;
$$;
GRANT EXECUTE ON FUNCTION mark_booking_unpaid(UUID) TO authenticated;

-- ------------------------------------------------------------
-- coach_cancel_booking — cancel with a reason (reuses cancel_booking)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION coach_cancel_booking(p_booking_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN
        RAISE EXCEPTION 'not your booking';
    END IF;
    UPDATE bookings SET change_reason = NULLIF(trim(p_reason), '') WHERE id = p_booking_id;
    RETURN cancel_booking(p_booking_id);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_cancel_booking(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- coach_reschedule_booking — move a confirmed lesson to another of the coach's open slots
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION coach_reschedule_booking(p_booking_id UUID, p_new_slot_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk  bookings%ROWTYPE;
    v_old slots%ROWTYPE;
    v_new slots%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN
        RAISE EXCEPTION 'not your booking';
    END IF;
    IF v_bk.status <> 'confirmed' THEN
        RAISE EXCEPTION 'only confirmed lessons can be rescheduled';
    END IF;
    IF p_new_slot_id = v_bk.slot_id THEN
        RAISE EXCEPTION 'pick a different time';
    END IF;

    -- Lock both slots in a stable order to avoid deadlocks.
    PERFORM 1 FROM slots WHERE id IN (v_bk.slot_id, p_new_slot_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_old FROM slots WHERE id = v_bk.slot_id;
    SELECT * INTO v_new FROM slots WHERE id = p_new_slot_id;
    IF NOT FOUND OR v_new.coach_id <> v_bk.coach_id THEN
        RAISE EXCEPTION 'that time is not one of your slots';
    END IF;
    IF v_new.status NOT IN ('open', 'booked') OR v_new.seats_taken >= v_new.seats_total THEN
        RAISE EXCEPTION 'that time is full';
    END IF;
    IF v_new.starts_at < now() THEN
        RAISE EXCEPTION 'that time has already passed';
    END IF;

    -- Release the old seat first so the no-overlap guard doesn't trip.
    UPDATE slots SET seats_taken = GREATEST(seats_taken - 1, 0), status = 'open' WHERE id = v_old.id;
    UPDATE slots
       SET seats_taken = seats_taken + 1,
           status = CASE WHEN seats_taken + 1 >= seats_total THEN 'booked' ELSE 'open' END
     WHERE id = v_new.id;

    UPDATE bookings SET slot_id = v_new.id, change_reason = NULLIF(trim(p_reason), ''),
                        reminder_sent_24h = false, reminder_sent_2h = false
     WHERE id = v_bk.id;
    UPDATE booking_requests SET slot_id = v_new.id WHERE id = v_bk.request_id;

    RETURN jsonb_build_object('booking_id', v_bk.id, 'old_starts_at', v_old.starts_at, 'new_starts_at', v_new.starts_at);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_reschedule_booking(UUID, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Schedule items: add facility status + per-attendee payment/contact data.
-- Return type changes, so drop + recreate (feed edge fn and get_coach_schedule call it).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS coach_schedule_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION coach_schedule_items(p_coach_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    slot_id          UUID,
    starts_at        TIMESTAMPTZ,
    ends_at          TIMESTAMPTZ,
    seats_total      INT,
    facility_label   TEXT,
    facility_address TEXT,
    facility_status  TEXT,
    status           TEXT,
    attendees        JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH entries AS (
        SELECT b.slot_id, 'booking'::text AS kind, b.id, b.status,
               b.athlete_id, b.parent_user_id, r.session_type_id, r.notes, r.film_links,
               b.price_cents, b.payment_status, b.payment_method, b.paid_at
        FROM bookings b
        JOIN booking_requests r ON r.id = b.request_id
        WHERE b.coach_id = p_coach_id AND b.status IN ('confirmed', 'completed', 'no_show')
        UNION ALL
        SELECT r.slot_id, 'request', r.id, r.status,
               r.athlete_id, r.parent_user_id, r.session_type_id, r.notes, r.film_links,
               st.price_cents, NULL, NULL, NULL
        FROM booking_requests r
        JOIN session_types st ON st.id = r.session_type_id
        WHERE r.coach_id = p_coach_id AND r.status = 'requested'
    )
    SELECT s.id, s.starts_at, s.ends_at, s.seats_total,
           f.label, f.address, s.facility_status,
           CASE WHEN bool_or(e.kind = 'booking') THEN 'booked' ELSE 'pending' END,
           jsonb_agg(jsonb_build_object(
               'kind', e.kind,
               'id', e.id,
               'status', e.status,
               'athlete_name', COALESCE(NULLIF(trim(a.first_name || ' ' || COALESCE(a.last_name, '')), ''), 'Athlete'),
               'athlete_profile', jsonb_build_object(
                   'grad_year', a.grad_year, 'positions', a.positions, 'level', a.level,
                   'club_team', a.club_team, 'height_inches', a.height_inches, 'goals', a.goals),
               'parent_name', up.display_name,
               'parent_email', u.email,
               'session_type', st.name,
               'session_kind', st.kind,
               'notes', e.notes,
               'film_links', e.film_links,
               'price_cents', e.price_cents,
               'payment_status', e.payment_status,
               'payment_method', e.payment_method,
               'paid_at', e.paid_at
           ) ORDER BY e.kind, a.first_name)
    FROM slots s
    JOIN entries e ON e.slot_id = s.id
    LEFT JOIN facilities f ON f.id = s.facility_id
    LEFT JOIN athletes a ON a.id = e.athlete_id
    LEFT JOIN user_profiles up ON up.id = e.parent_user_id
    LEFT JOIN auth.users u ON u.id = e.parent_user_id
    LEFT JOIN session_types st ON st.id = e.session_type_id
    WHERE s.coach_id = p_coach_id
      AND s.starts_at >= p_from AND s.starts_at < p_to
    GROUP BY s.id, f.label, f.address
    ORDER BY s.starts_at;
$$;
REVOKE EXECUTE ON FUNCTION coach_schedule_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_schedule_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
