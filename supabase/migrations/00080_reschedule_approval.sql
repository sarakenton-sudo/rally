-- ============================================================
-- Coach reschedules need the family's OK.
-- The coach proposes a new time; the original lesson stays booked and the
-- new time is held (one seat) until the family accepts or keeps the
-- original. Accepting moves the booking AND its request (the parent's
-- lesson list reads the request's slot — 00067's direct move left it on
-- the old time). Charge timing and reminders follow the slot via the
-- existing triggers (00071, 00079).
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_slot_id UUID REFERENCES slots(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposal_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_proposed ON bookings(proposed_slot_id) WHERE proposed_slot_id IS NOT NULL;

-- Repair lessons already moved by the old direct reschedule.
UPDATE booking_requests br
   SET slot_id = b.slot_id
  FROM bookings b
 WHERE b.request_id = br.id AND br.slot_id IS DISTINCT FROM b.slot_id;

-- Release a held seat (internal).
CREATE OR REPLACE FUNCTION release_held_seat(p_slot_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE slots SET seats_taken = GREATEST(seats_taken - 1, 0),
                     status = CASE WHEN status = 'booked' THEN 'open' ELSE status END
     WHERE id = p_slot_id;
$$;
REVOKE ALL ON FUNCTION release_held_seat(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- coach_propose_reschedule — coach suggests a new time
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION coach_propose_reschedule(p_booking_id UUID, p_new_slot_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk  bookings%ROWTYPE;
    v_new slots%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN RAISE EXCEPTION 'not your booking'; END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'only confirmed lessons can be rescheduled'; END IF;
    IF p_new_slot_id = v_bk.slot_id THEN RAISE EXCEPTION 'pick a different time'; END IF;

    SELECT * INTO v_new FROM slots WHERE id = p_new_slot_id FOR UPDATE;
    IF NOT FOUND OR v_new.coach_id <> v_bk.coach_id THEN RAISE EXCEPTION 'that time is not one of your slots'; END IF;
    IF v_new.starts_at < now() THEN RAISE EXCEPTION 'that time has already passed'; END IF;

    -- Replacing an earlier proposal: give that seat back first.
    IF v_bk.proposed_slot_id IS NOT NULL AND v_bk.proposed_slot_id <> p_new_slot_id THEN
        PERFORM release_held_seat(v_bk.proposed_slot_id);
    END IF;
    IF v_bk.proposed_slot_id IS DISTINCT FROM p_new_slot_id THEN
        IF v_new.status NOT IN ('open', 'booked') OR v_new.seats_taken >= v_new.seats_total THEN
            RAISE EXCEPTION 'that time is full';
        END IF;
        -- Hold the seat so nobody else books it while the family decides.
        UPDATE slots SET seats_taken = seats_taken + 1,
                         status = CASE WHEN seats_taken + 1 >= seats_total THEN 'booked' ELSE 'open' END
         WHERE id = p_new_slot_id;
    END IF;

    UPDATE bookings SET proposed_slot_id = p_new_slot_id, proposed_at = now(),
                        proposal_reason = NULLIF(trim(p_reason), '')
     WHERE id = v_bk.id;
    RETURN jsonb_build_object('booking_id', v_bk.id, 'proposed_slot_id', p_new_slot_id);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_propose_reschedule(UUID, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- coach_withdraw_reschedule — coach takes the proposal back
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION coach_withdraw_reschedule(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN RAISE EXCEPTION 'not your booking'; END IF;
    IF v_bk.proposed_slot_id IS NULL THEN RETURN; END IF;
    PERFORM release_held_seat(v_bk.proposed_slot_id);
    UPDATE bookings SET proposed_slot_id = NULL, proposed_at = NULL, proposal_reason = NULL WHERE id = v_bk.id;
END;
$$;
GRANT EXECUTE ON FUNCTION coach_withdraw_reschedule(UUID) TO authenticated;

-- ------------------------------------------------------------
-- respond_to_reschedule — the family accepts or keeps the original
-- (the parent who booked, or a co-parent who manages that athlete)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION respond_to_reschedule(p_booking_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk  bookings%ROWTYPE;
    v_new slots%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT (
        v_bk.parent_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_athletes aa WHERE aa.admin_id = auth.uid() AND aa.athlete_id = v_bk.athlete_id AND aa.permission = 'manage')
    ) THEN
        RAISE EXCEPTION 'lesson not found';
    END IF;
    IF v_bk.proposed_slot_id IS NULL THEN RAISE EXCEPTION 'this new time was already answered or withdrawn'; END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'this lesson is no longer active'; END IF;

    IF p_accept THEN
        SELECT * INTO v_new FROM slots WHERE id = v_bk.proposed_slot_id;
        IF v_new.starts_at < now() THEN RAISE EXCEPTION 'that new time has already passed'; END IF;
        -- Seat on the new slot is already held; free the old one.
        PERFORM release_held_seat(v_bk.slot_id);
        UPDATE bookings SET slot_id = v_bk.proposed_slot_id,
                            change_reason = v_bk.proposal_reason,
                            proposed_slot_id = NULL, proposed_at = NULL, proposal_reason = NULL
         WHERE id = v_bk.id;
        UPDATE booking_requests SET slot_id = v_bk.proposed_slot_id WHERE id = v_bk.request_id;
    ELSE
        PERFORM release_held_seat(v_bk.proposed_slot_id);
        UPDATE bookings SET proposed_slot_id = NULL, proposed_at = NULL, proposal_reason = NULL WHERE id = v_bk.id;
    END IF;
    RETURN jsonb_build_object('booking_id', v_bk.id, 'accepted', p_accept);
END;
$$;
GRANT EXECUTE ON FUNCTION respond_to_reschedule(UUID, BOOLEAN) TO authenticated;

-- A cancelled lesson can't keep a held seat.
CREATE OR REPLACE FUNCTION clear_proposal_on_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND OLD.proposed_slot_id IS NOT NULL THEN
        PERFORM release_held_seat(OLD.proposed_slot_id);
        NEW.proposed_slot_id := NULL; NEW.proposed_at := NULL; NEW.proposal_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_clear_proposal_on_cancel ON bookings;
CREATE TRIGGER bookings_clear_proposal_on_cancel
    BEFORE UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION clear_proposal_on_cancel();

-- Old direct move: keep the request in sync if anything still calls it.
CREATE OR REPLACE FUNCTION sync_request_slot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE booking_requests SET slot_id = NEW.slot_id WHERE id = NEW.request_id AND slot_id IS DISTINCT FROM NEW.slot_id;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_sync_request_slot ON bookings;
CREATE TRIGGER bookings_sync_request_slot
    AFTER UPDATE OF slot_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION sync_request_slot();
