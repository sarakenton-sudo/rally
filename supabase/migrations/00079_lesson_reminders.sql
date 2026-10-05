-- ============================================================
-- Lesson reminders + missed-revenue nudges (edge fn lesson-reminders, pg_cron
-- every 15 min — see supabase/cron/lesson_reminders.sql.template).
--   Parents: 24h + 2h before a confirmed lesson (bookings.reminder_sent_24h/2h
--            already exist from 00056).
--   Coaches: morning summary, 1h heads-up per lesson, evening unpaid nudge.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coach_reminder_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unpaid_nudge_count  INT     NOT NULL DEFAULT 0;

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_summary_date      DATE;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_unpaid_nudge_date DATE;

-- Per-user opt-out (parents and coaches). push_enabled=false also silences these.
ALTER TABLE coaching_notification_prefs ADD COLUMN IF NOT EXISTS lesson_reminders BOOLEAN NOT NULL DEFAULT true;

-- A rescheduled lesson gets fresh reminders, whoever moved it.
CREATE OR REPLACE FUNCTION reset_lesson_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN
        NEW.reminder_sent_24h := false;
        NEW.reminder_sent_2h := false;
        NEW.coach_reminder_sent := false;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_reset_reminders ON bookings;
CREATE TRIGGER bookings_reset_reminders BEFORE UPDATE OF slot_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION reset_lesson_reminders();

-- Sweep for unpaid lessons (the reminder sweep uses idx_bookings_reminders).
CREATE INDEX IF NOT EXISTS idx_bookings_unpaid_nudge ON bookings(coach_id)
    WHERE payment_status IN ('pending', 'authorized', 'failed')
      AND status IN ('confirmed', 'completed')
      AND unpaid_nudge_count < 2;
