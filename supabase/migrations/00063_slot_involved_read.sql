-- ============================================================
-- Coaching & Lessons Module — let a parent read slots they've requested/booked
-- The base slot policy only exposes OPEN slots; once a slot is held/booked a
-- parent could no longer see their own lesson's time. This additive policy
-- (OR'd with the existing one) lets a parent read any slot they're involved in.
-- ============================================================
CREATE POLICY "Slots read by involved parent"
    ON slots FOR SELECT
    USING (
        id IN (SELECT slot_id FROM booking_requests WHERE parent_user_id = auth.uid())
    );
