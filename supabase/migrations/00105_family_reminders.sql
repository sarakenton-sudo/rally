-- ============================================================
-- Family reminders for tournaments and games (like lesson reminders):
--   * Sunday evening "Week ahead" (tournaments, games, lessons, by kid)
--   * Night before (tournaments starting and games tomorrow)
-- One row per person per reminder so nothing is sent twice.
-- ============================================================
CREATE TABLE IF NOT EXISTS family_reminders_sent (
    user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind     TEXT NOT NULL,         -- 'week_ahead' | 'night_before'
    ref_day  DATE NOT NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, ref_day)
);
ALTER TABLE family_reminders_sent ENABLE ROW LEVEL SECURITY;  -- server only
