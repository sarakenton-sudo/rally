-- ============================================================
-- 00084
-- 1. Games: pasted school schedules have single matches as well as
--    tournaments. They're stored as team events of type 'game'.
-- 2. Lesson notifications become admin-editable templates
--    (category 'lessons'). Edge functions read the published template by
--    slug (supabase/functions/_shared/templates.ts) and fall back to their
--    built-in wording when a row is missing. is_active = false turns that
--    notification off on every channel. ON CONFLICT DO NOTHING keeps any
--    edits an admin has already made if this runs again.
-- ============================================================

-- ---------- 1. Team events: games ----------
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'event';
DO $$ BEGIN
    ALTER TABLE team_events ADD CONSTRAINT team_events_event_type_check
        CHECK (event_type IN ('event', 'game', 'practice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS opponent  TEXT;
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS home_away TEXT;   -- 'home' | 'away' | NULL (unknown)
CREATE INDEX IF NOT EXISTS idx_team_events_season_date ON team_events(season_id, date);

-- ---------- 2. Lesson notification templates ----------
-- Variables use {{name}}. "where" is " · Facility" (or empty) so lines read
-- naturally whether or not a facility is set.
INSERT INTO notification_templates
    (slug, category, channels, title_template, body_template, title_char_limit, body_char_limit, variables)
VALUES
-- Parents
('lesson_reminder_24h', 'lessons', '{push,email}',
 '{{athlete}}''s lesson with {{coach}}', '{{day}} at {{time}}{{where}}', 80, 300,
 '["athlete","coach","day","time","where","facility"]'),
('lesson_reminder_2h', 'lessons', '{push}',
 '{{athlete}}''s lesson with {{coach}}', 'Starts in 2 hours, at {{time}}{{where}}', 80, 300,
 '["athlete","coach","time","where","facility"]'),
('lesson_booked_by_coach', 'lessons', '{push,email}',
 '{{coach}} booked a lesson for {{athlete}}', '{{when}}{{where}}. It''s on your RallyHUB calendar.', 80, 300,
 '["coach","athlete","when","where"]'),
('lesson_cancelled', 'lessons', '{push,email}',
 '{{coach}} cancelled {{athlete}}''s lesson', 'The lesson on {{when}} is cancelled. {{reason}}', 80, 400,
 '["coach","athlete","when","reason"]'),
('lesson_moved', 'lessons', '{push,email}',
 '{{coach}} moved {{athlete}}''s lesson', 'New time: {{when}}{{where}}. {{reason}}', 80, 400,
 '["coach","athlete","when","where","reason"]'),
('reschedule_proposed', 'lessons', '{push,email}',
 '{{coach}} asked to move {{athlete}}''s lesson',
 'From {{when}} to {{proposed_when}}{{proposed_where}}. Accept the new time or keep the original. {{reason}}', 80, 400,
 '["coach","athlete","when","proposed_when","proposed_where","reason"]'),
('coach_announcement', 'lessons', '{push,email}',
 '{{coach}} has open lesson times', '{{message}}', 80, 600,
 '["coach","message","link"]'),
-- Coaches
('booking_request_coach', 'lessons', '{push,email}',
 'Lesson request from {{athlete}}', '{{details}}. Approve or decline in RallyHUB.', 80, 300,
 '["athlete","details","when","lesson_type","facility"]'),
('booking_confirmed_coach', 'lessons', '{push,email}',
 'New booking: {{athlete}}', '{{details}}', 80, 300,
 '["athlete","details","when","lesson_type","facility"]'),
('reschedule_accepted', 'lessons', '{push,email}',
 '{{athlete}}''s family accepted the new time', 'The lesson is now {{when}}{{where}}.', 80, 300,
 '["athlete","when","where"]'),
('reschedule_declined', 'lessons', '{push,email}',
 '{{athlete}}''s family kept the original time', 'The lesson stays at {{when}}. The time you offered is open again.', 80, 300,
 '["athlete","when"]'),
('coach_lesson_heads_up', 'lessons', '{push}',
 'Lesson with {{athletes}} in 1 hour', '{{time}}{{where}}', 80, 300,
 '["athletes","time","where","facility"]'),
('coach_daily_summary', 'lessons', '{push}',
 '{{lessons}} today', 'First at {{first_time}}{{total}}', 80, 300,
 '["lessons","first_time","total","amount"]'),
('coach_unpaid_nudge', 'lessons', '{push,email}',
 '{{lessons}} still unpaid ({{total}})', 'Tap to record cash, Venmo, or Zelle.', 80, 300,
 '["lessons","total"]'),
-- Family-initiated changes (00082)
('lesson_cancelled_by_family', 'lessons', '{push,email}',
 '{{athlete}}''s family cancelled a lesson', 'The lesson on {{when}} is cancelled and that time is open again. {{reason}}', 80, 300,
 '["athlete","when","reason"]'),
('reschedule_proposed_by_family', 'lessons', '{push,email}',
 '{{athlete}}''s family asked to move a lesson', 'From {{when}} to {{proposed_when}}{{proposed_where}}. Accept the new time or keep the original. {{reason}}', 80, 300,
 '["athlete","when","proposed_when","proposed_where","reason"]'),
('reschedule_accepted_by_coach', 'lessons', '{push,email}',
 '{{coach}} accepted your new time', '{{athlete}}''s lesson is now {{when}}{{where}}.', 80, 300,
 '["coach","athlete","when","where"]'),
('reschedule_declined_by_coach', 'lessons', '{push,email}',
 '{{coach}} kept the original time', '{{athlete}}''s lesson stays at {{when}}{{where}}.', 80, 300,
 '["coach","athlete","when","where"]')
ON CONFLICT (slug) DO NOTHING;
