-- ============================================================
-- Parent-initiated lesson changes.
--  * parent_cancel_booking — the family cancels a confirmed lesson up to the
--    cutoff (24h before start, matching refund-booking's automatic-refund
--    rule). Inside the cutoff the app shows "Contact your coach" instead.
--  * Reschedules either side can propose (00080 was coach-only):
--    bookings.proposed_by = 'coach' | 'parent'. The other side answers.
--      coach → family : respond_to_reschedule (00080, now checks proposed_by)
--      family → coach : coach_respond_to_reschedule
--  * parent_withdraw_reschedule — the family takes back its own proposal.
-- Seat holding, charge timing and reminders work exactly as in 00080.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_by TEXT CHECK (proposed_by IN ('coach', 'parent'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('coach', 'parent'));
-- Proposals made before this column existed were all coach proposals.
UPDATE bookings SET proposed_by = 'coach' WHERE proposed_slot_id IS NOT NULL AND proposed_by IS NULL;

-- Hours before start that a family can still cancel/reschedule in the app.
CREATE OR REPLACE FUNCTION lesson_change_cutoff_hours() RETURNS INT
LANGUAGE sql IMMUTABLE AS $$ SELECT 24 $$;

-- The family member acting on a booking: the parent who booked it, or a
-- co-parent with manage permission on that athlete.
CREATE OR REPLACE FUNCTION is_booking_family(p_bk bookings)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_bk.parent_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_athletes aa
                    WHERE aa.admin_id = auth.uid() AND aa.athlete_id = p_bk.athlete_id AND aa.permission = 'manage');
$$;

-- Shared move/keep logic for answering a proposal (internal).
CREATE OR REPLACE FUNCTION apply_reschedule_answer(p_booking_id UUID, p_accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_bk  bookings%ROWTYPE;
    v_new slots%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF p_accept THEN
        SELECT * INTO v_new FROM slots WHERE id = v_bk.proposed_slot_id;
        IF v_new.starts_at < now() THEN RAISE EXCEPTION 'that new time has already passed'; END IF;
        PERFORM release_held_seat(v_bk.slot_id);           -- new seat is already held
        UPDATE bookings SET slot_id = v_bk.proposed_slot_id,
                            change_reason = v_bk.proposal_reason,
                            proposed_slot_id = NULL, proposed_at = NULL, proposal_reason = NULL, proposed_by = NULL
         WHERE id = v_bk.id;
        UPDATE booking_requests SET slot_id = v_bk.proposed_slot_id WHERE id = v_bk.request_id;
    ELSE
        PERFORM release_held_seat(v_bk.proposed_slot_id);
        UPDATE bookings SET proposed_slot_id = NULL, proposed_at = NULL, proposal_reason = NULL, proposed_by = NULL
         WHERE id = v_bk.id;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION apply_reschedule_answer(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Coach proposals now record who proposed.
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
    IF v_bk.proposed_slot_id IS NOT NULL AND v_bk.proposed_by = 'parent' THEN
        RAISE EXCEPTION 'the family asked for a new time — answer their request first';
    END IF;

    SELECT * INTO v_new FROM slots WHERE id = p_new_slot_id FOR UPDATE;
    IF NOT FOUND OR v_new.coach_id <> v_bk.coach_id THEN RAISE EXCEPTION 'that time is not one of your slots'; END IF;
    IF v_new.starts_at < now() THEN RAISE EXCEPTION 'that time has already passed'; END IF;

    IF v_bk.proposed_slot_id IS NOT NULL AND v_bk.proposed_slot_id <> p_new_slot_id THEN
        PERFORM release_held_seat(v_bk.proposed_slot_id);
    END IF;
    IF v_bk.proposed_slot_id IS DISTINCT FROM p_new_slot_id THEN
        IF v_new.status NOT IN ('open', 'booked') OR v_new.seats_taken >= v_new.seats_total THEN
            RAISE EXCEPTION 'that time is full';
        END IF;
        UPDATE slots SET seats_taken = seats_taken + 1,
                         status = CASE WHEN seats_taken + 1 >= seats_total THEN 'booked' ELSE 'open' END
         WHERE id = p_new_slot_id;
    END IF;

    UPDATE bookings SET proposed_slot_id = p_new_slot_id, proposed_at = now(), proposed_by = 'coach',
                        proposal_reason = NULLIF(trim(p_reason), '')
     WHERE id = v_bk.id;
    RETURN jsonb_build_object('booking_id', v_bk.id, 'proposed_slot_id', p_new_slot_id);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_propose_reschedule(UUID, UUID, TEXT) TO authenticated;

-- Coach withdraws only their own proposal.
CREATE OR REPLACE FUNCTION coach_withdraw_reschedule(p_booking_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN RAISE EXCEPTION 'not your booking'; END IF;
    IF v_bk.proposed_slot_id IS NULL OR v_bk.proposed_by = 'parent' THEN RETURN; END IF;
    PERFORM apply_reschedule_answer(v_bk.id, false);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_withdraw_reschedule(UUID) TO authenticated;

-- Family answers a COACH proposal.
CREATE OR REPLACE FUNCTION respond_to_reschedule(p_booking_id UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT is_booking_family(v_bk) THEN RAISE EXCEPTION 'lesson not found'; END IF;
    IF v_bk.proposed_slot_id IS NULL OR COALESCE(v_bk.proposed_by, 'coach') <> 'coach' THEN
        RAISE EXCEPTION 'this new time was already answered or withdrawn';
    END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'this lesson is no longer active'; END IF;
    PERFORM apply_reschedule_answer(v_bk.id, p_accept);
    RETURN jsonb_build_object('booking_id', v_bk.id, 'accepted', p_accept);
END;
$$;
GRANT EXECUTE ON FUNCTION respond_to_reschedule(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- parent_propose_reschedule — the family asks for one of the coach's open times
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION parent_propose_reschedule(p_booking_id UUID, p_new_slot_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk    bookings%ROWTYPE;
    v_old   slots%ROWTYPE;
    v_new   slots%ROWTYPE;
    v_stype UUID;
    v_conn  UUID;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT is_booking_family(v_bk) THEN RAISE EXCEPTION 'lesson not found'; END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'only confirmed lessons can be rescheduled'; END IF;
    IF p_new_slot_id = v_bk.slot_id THEN RAISE EXCEPTION 'pick a different time'; END IF;
    IF v_bk.proposed_slot_id IS NOT NULL AND v_bk.proposed_by = 'coach' THEN
        RAISE EXCEPTION 'your coach asked to move this lesson — answer that first';
    END IF;

    SELECT * INTO v_old FROM slots WHERE id = v_bk.slot_id;
    IF v_old.starts_at < now() + make_interval(hours => lesson_change_cutoff_hours()) THEN
        RAISE EXCEPTION 'CUTOFF: this lesson is less than % hours away — contact your coach to change it', lesson_change_cutoff_hours();
    END IF;

    SELECT * INTO v_new FROM slots WHERE id = p_new_slot_id FOR UPDATE;
    IF NOT FOUND OR v_new.coach_id <> v_bk.coach_id THEN RAISE EXCEPTION 'that time is not with this coach'; END IF;
    IF v_new.starts_at < now() THEN RAISE EXCEPTION 'that time has already passed'; END IF;
    -- Public times, or a private time this coach opened for this family.
    SELECT id INTO v_conn FROM coach_connections WHERE coach_id = v_bk.coach_id AND parent_user_id = v_bk.parent_user_id;
    IF COALESCE(v_new.visibility, 'all') <> 'all' AND v_new.shared_with_connection_id IS DISTINCT FROM v_conn THEN
        RAISE EXCEPTION 'that time is not open for booking';
    END IF;
    SELECT session_type_id INTO v_stype FROM booking_requests WHERE id = v_bk.request_id;
    IF array_length(v_new.eligible_session_type_ids, 1) > 0 AND NOT (v_stype = ANY (v_new.eligible_session_type_ids)) THEN
        RAISE EXCEPTION 'that time is for a different lesson type';
    END IF;

    IF v_bk.proposed_slot_id IS NOT NULL AND v_bk.proposed_slot_id <> p_new_slot_id THEN
        PERFORM release_held_seat(v_bk.proposed_slot_id);
    END IF;
    IF v_bk.proposed_slot_id IS DISTINCT FROM p_new_slot_id THEN
        IF v_new.status NOT IN ('open', 'booked') OR v_new.seats_taken >= v_new.seats_total THEN
            RAISE EXCEPTION 'that time is full';
        END IF;
        UPDATE slots SET seats_taken = seats_taken + 1,
                         status = CASE WHEN seats_taken + 1 >= seats_total THEN 'booked' ELSE 'open' END
         WHERE id = p_new_slot_id;
    END IF;

    UPDATE bookings SET proposed_slot_id = p_new_slot_id, proposed_at = now(), proposed_by = 'parent',
                        proposal_reason = NULLIF(trim(p_reason), '')
     WHERE id = v_bk.id;
    RETURN jsonb_build_object('booking_id', v_bk.id, 'proposed_slot_id', p_new_slot_id);
END;
$$;
GRANT EXECUTE ON FUNCTION parent_propose_reschedule(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION parent_withdraw_reschedule(p_booking_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT is_booking_family(v_bk) THEN RAISE EXCEPTION 'lesson not found'; END IF;
    IF v_bk.proposed_slot_id IS NULL OR v_bk.proposed_by <> 'parent' THEN RETURN; END IF;
    PERFORM apply_reschedule_answer(v_bk.id, false);
END;
$$;
GRANT EXECUTE ON FUNCTION parent_withdraw_reschedule(UUID) TO authenticated;

-- Coach answers a FAMILY proposal.
CREATE OR REPLACE FUNCTION coach_respond_to_reschedule(p_booking_id UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN RAISE EXCEPTION 'not your booking'; END IF;
    IF v_bk.proposed_slot_id IS NULL OR v_bk.proposed_by <> 'parent' THEN
        RAISE EXCEPTION 'this request was already answered or withdrawn';
    END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'this lesson is no longer active'; END IF;
    PERFORM apply_reschedule_answer(v_bk.id, p_accept);
    RETURN jsonb_build_object('booking_id', v_bk.id, 'accepted', p_accept);
END;
$$;
GRANT EXECUTE ON FUNCTION coach_respond_to_reschedule(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- parent_cancel_booking — the family cancels (outside the cutoff)
-- Refunds go through the refund-booking function (same 24h rule).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION parent_cancel_booking(p_booking_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk   bookings%ROWTYPE;
    v_slot slots%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT is_booking_family(v_bk) THEN RAISE EXCEPTION 'lesson not found'; END IF;
    IF v_bk.status <> 'confirmed' THEN RAISE EXCEPTION 'this lesson is already %', v_bk.status; END IF;
    SELECT * INTO v_slot FROM slots WHERE id = v_bk.slot_id;
    IF v_slot.starts_at < now() + make_interval(hours => lesson_change_cutoff_hours()) THEN
        RAISE EXCEPTION 'CUTOFF: this lesson is less than % hours away — contact your coach to cancel', lesson_change_cutoff_hours();
    END IF;

    -- clear_proposal_on_cancel (00080) releases any held seat.
    UPDATE bookings SET status = 'cancelled', cancelled_by = 'parent', change_reason = NULLIF(trim(p_reason), ''),
                        charge_due_at = NULL
     WHERE id = v_bk.id;
    UPDATE booking_requests SET status = 'cancelled' WHERE id = v_bk.request_id;
    PERFORM release_held_seat(v_bk.slot_id);
    RETURN jsonb_build_object('booking_id', v_bk.id, 'payment_status', v_bk.payment_status);
END;
$$;
GRANT EXECUTE ON FUNCTION parent_cancel_booking(UUID, TEXT) TO authenticated;

-- Coach cancels are recorded too (for the parent's lesson detail).
CREATE OR REPLACE FUNCTION mark_coach_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_by IS NULL THEN
        NEW.cancelled_by := CASE WHEN NEW.coach_id = my_coach_id() THEN 'coach'
                                 WHEN is_booking_family(NEW) THEN 'parent' END;   -- NULL: admin/system
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_mark_cancelled_by ON bookings;
CREATE TRIGGER bookings_mark_cancelled_by
    BEFORE UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION mark_coach_cancel();
