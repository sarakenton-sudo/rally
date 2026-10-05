-- ============================================================
-- Coach notification settings + new lesson pushes.
--  * coach_notification_settings: per coach, which notifications the coach
--    gets ("self") and which their families get ("clients"). A missing key
--    means ON. Coach Business → Notifications edits it.
--  * New pushes (lesson-reminders): player day-before confirmation,
--    coach Sunday-night week ahead, coach nightly 7pm tomorrow's schedule.
-- ============================================================

CREATE TABLE IF NOT EXISTS coach_notification_settings (
    coach_id    UUID PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,
    -- lesson_request, family_reschedule, family_cancelled, heads_up,
    -- morning_summary, unpaid_nudge, week_ahead, tomorrow_schedule
    self        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- reminder_24h, reminder_2h, day_before_athlete, lesson_changes, announcements
    clients     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coach_notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coach manages own notification settings" ON coach_notification_settings;
CREATE POLICY "Coach manages own notification settings" ON coach_notification_settings
    FOR ALL USING (coach_id = my_coach_id()) WITH CHECK (coach_id = my_coach_id());

-- Is a notification on? (missing key = on). For SQL callers; edge functions read the row.
CREATE OR REPLACE FUNCTION coach_notification_on(p_coach_id UUID, p_scope TEXT, p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
        SELECT CASE p_scope WHEN 'self' THEN (self ->> p_key)::boolean ELSE (clients ->> p_key)::boolean END
        FROM coach_notification_settings WHERE coach_id = p_coach_id
    ), true);
$$;

-- Once-per-night / once-per-week send tracking (local dates).
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_week_ahead_date DATE;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_tomorrow_date DATE;
-- Player (athlete login) day-before confirmation, separate from the parent's 24h reminder.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS athlete_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- Reschedules start over (same rule 00079 applies to the other reminder flags).
CREATE OR REPLACE FUNCTION reset_athlete_reminder_on_move()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN NEW.athlete_reminder_sent := false; END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_reset_athlete_reminder ON bookings;
CREATE TRIGGER bookings_reset_athlete_reminder BEFORE UPDATE OF slot_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION reset_athlete_reminder_on_move();

-- ---------- Templates (admin-editable; built-in text is the fallback) ----------
INSERT INTO notification_templates
    (slug, category, channels, title_template, body_template, title_char_limit, body_char_limit, variables)
VALUES
('lesson_day_before_athlete', 'lessons', '{push}',
 'Lesson {{day}} at {{time}}', 'With {{coach}}{{where}}. See you there!', 80, 300,
 '["day","time","coach","where","facility"]'),
('coach_week_ahead', 'lessons', '{push}',
 'This week: {{lessons}}', '{{total}} booked{{gyms}}{{tomorrow}}', 80, 300,
 '["lessons","total","gyms","tomorrow"]'),
('coach_tomorrow_schedule', 'lessons', '{push}',
 'Tomorrow: {{lessons}}', '{{schedule}}', 80, 300,
 '["lessons","schedule"]')
ON CONFLICT (slug) DO NOTHING;
