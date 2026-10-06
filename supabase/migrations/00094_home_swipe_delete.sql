-- ============================================================
-- Home: swipe left to delete a game, or clear a cancelled/declined lesson.
-- Games (team_events) are the family's own rows, so they're deleted.
-- Lessons belong to the coach's records too, so the family only hides them.
-- ============================================================

-- Parents with manage permission can delete their athletes' games/team events.
DROP POLICY IF EXISTS "Family deletes team events" ON team_events;
CREATE POLICY "Family deletes team events" ON team_events FOR DELETE
    USING (season_id IN (SELECT s.id FROM seasons s JOIN admin_athletes aa ON aa.athlete_id = s.athlete_id
                          WHERE aa.admin_id = auth.uid() AND aa.permission = 'manage'));

ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS hidden_by_family_at TIMESTAMPTZ;

-- Hide a cancelled or declined lesson from the family's Home.
CREATE OR REPLACE FUNCTION hide_family_lesson(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE booking_requests SET hidden_by_family_at = now()
     WHERE id = p_request_id
       AND (status IN ('cancelled', 'declined')
            OR EXISTS (SELECT 1 FROM bookings b WHERE b.request_id = p_request_id AND b.status = 'cancelled'))
       AND athlete_id IN (SELECT my_athlete_ids());
    IF NOT FOUND THEN RAISE EXCEPTION 'Only cancelled or declined lessons can be removed.'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION hide_family_lesson(UUID) TO authenticated;
