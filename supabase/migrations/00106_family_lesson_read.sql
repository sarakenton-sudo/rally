-- ============================================================
-- Coaching — the whole family can read an athlete's lessons
-- Lesson reads only matched the parent who booked (parent_user_id), so a
-- co-parent saw nothing. Read access now follows the athlete: anyone in
-- the family (my_athlete_ids(), via admin_athletes) sees that athlete's
-- requests, bookings, slots and the coach's name/types/gyms. Additive
-- policies (OR'd with the existing ones); writes are unchanged — the
-- parent change RPCs (00082) already allow 'manage' co-parents.
-- ============================================================

-- Coaches the family is connected to (any parent in the family, or for any of its athletes).
CREATE OR REPLACE FUNCTION my_connected_coach_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coach_id FROM coach_connections WHERE parent_user_id = auth.uid()
    UNION
    SELECT coach_id FROM coach_connections WHERE athlete_id IN (SELECT my_athlete_ids())
$$;

-- Slots of the family's lessons (booked, or proposed for a move). SECURITY
-- DEFINER so the slots policy doesn't re-enter booking_requests/bookings RLS.
CREATE OR REPLACE FUNCTION my_family_lesson_slot_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT slot_id FROM booking_requests WHERE athlete_id IN (SELECT my_athlete_ids())
    UNION
    SELECT proposed_slot_id FROM bookings
     WHERE athlete_id IN (SELECT my_athlete_ids()) AND proposed_slot_id IS NOT NULL
$$;

DROP POLICY IF EXISTS "Booking requests read by family" ON booking_requests;
CREATE POLICY "Booking requests read by family"
    ON booking_requests FOR SELECT
    USING (athlete_id IN (SELECT my_athlete_ids()));

DROP POLICY IF EXISTS "Bookings read by family" ON bookings;
CREATE POLICY "Bookings read by family"
    ON bookings FOR SELECT
    USING (athlete_id IN (SELECT my_athlete_ids()));

DROP POLICY IF EXISTS "Slots read by family" ON slots;
CREATE POLICY "Slots read by family"
    ON slots FOR SELECT
    USING (id IN (SELECT my_family_lesson_slot_ids()));

DROP POLICY IF EXISTS "Coaches read by family" ON coaches;
CREATE POLICY "Coaches read by family"
    ON coaches FOR SELECT
    USING (id IN (SELECT my_connected_coach_ids()));

DROP POLICY IF EXISTS "Facilities read by family" ON facilities;
CREATE POLICY "Facilities read by family"
    ON facilities FOR SELECT
    USING (is_active AND coach_id IN (SELECT my_connected_coach_ids()));

-- session_types already reads through my_connected_coach_ids() (00055).
