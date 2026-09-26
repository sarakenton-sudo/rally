-- ============================================================
-- Coaching & Lessons Module — Notification preferences (PR 3c)
-- Per-user SMS/push prefs for coaching events, independent of the season
-- notification block on admin_config. Reuses send-notification + notification_log.
-- See docs/coaching-build-spec.md §2.5 / §7.9
-- ============================================================
CREATE TABLE coaching_notification_prefs (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    sms_enabled  BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coaching_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own coaching notification prefs"
    ON coaching_notification_prefs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON coaching_notification_prefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
