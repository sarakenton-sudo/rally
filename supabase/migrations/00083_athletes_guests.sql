-- ============================================================
-- Delete an athlete; lesson notification preferences.
-- ============================================================

-- Lesson notification switches (Settings → Notifications). lesson_reminders
-- came in 00079. The sending functions must check these:
--   lesson_changes → notify-booking-change (to the family)
--   announcements  → announce-slots
ALTER TABLE coaching_notification_prefs ADD COLUMN IF NOT EXISTS lesson_changes BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE coaching_notification_prefs ADD COLUMN IF NOT EXISTS announcements BOOLEAN NOT NULL DEFAULT true;

-- Kept only when the athlete has lesson history a coach still needs.
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- delete_athlete — a parent with 'manage' permission removes an athlete
-- from the family: teams (→ tournaments, hotels, flights, tickets, team
-- events), invites, guests and USAV profiles tied to the athlete, and every
-- family member's link to them. Past lessons stay on the coach's books, so
-- an athlete with lesson history is marked deleted instead of removed.
-- Refuses while upcoming confirmed lessons exist.
-- Returns 'deleted' or 'archived'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_athlete(p_athlete_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_upcoming INT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM admin_athletes
         WHERE admin_id = auth.uid() AND athlete_id = p_athlete_id AND permission = 'manage'
    ) THEN
        RAISE EXCEPTION 'You can only delete athletes you manage';
    END IF;

    SELECT count(*) INTO v_upcoming
      FROM bookings b JOIN slots s ON s.id = b.slot_id
     WHERE b.athlete_id = p_athlete_id AND b.status = 'confirmed' AND s.starts_at > now();
    IF v_upcoming > 0 THEN
        RAISE EXCEPTION 'This athlete has % upcoming lesson%. Cancel them first, then delete.',
            v_upcoming, CASE WHEN v_upcoming = 1 THEN '' ELSE 's' END;
    END IF;

    -- Pending lesson requests go too.
    UPDATE booking_requests SET status = 'cancelled'
     WHERE athlete_id = p_athlete_id AND status = 'requested';

    DELETE FROM seasons        WHERE athlete_id = p_athlete_id;  -- cascades to tournaments & travel
    DELETE FROM athlete_invites WHERE athlete_id = p_athlete_id;
    DELETE FROM guests         WHERE athlete_id = p_athlete_id;
    DELETE FROM usav_profiles  WHERE athlete_id = p_athlete_id;
    DELETE FROM admin_athletes WHERE athlete_id = p_athlete_id;  -- removes it from every family member

    IF EXISTS (SELECT 1 FROM bookings WHERE athlete_id = p_athlete_id) THEN
        -- Coaches keep past lesson records (bookings.athlete_id has no cascade).
        UPDATE athletes SET deleted_at = now(), user_id = NULL WHERE id = p_athlete_id;
        RETURN 'archived';
    END IF;
    DELETE FROM athletes WHERE id = p_athlete_id;
    RETURN 'deleted';
END;
$$;
GRANT EXECUTE ON FUNCTION delete_athlete(UUID) TO authenticated;
