-- RALLY: Admin Dashboard Tables
-- Per PRD Section 14.7

-- ============================================================
-- ADMIN USERS
-- ============================================================

CREATE TABLE admin_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'viewer')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- ============================================================
-- NOTIFICATION LOG
-- ============================================================

CREATE TABLE notification_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guest_id          UUID REFERENCES guests(id) ON DELETE SET NULL,
    tournament_id     UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL,
    channel           TEXT NOT NULL CHECK (channel IN ('push', 'sms', 'email')),
    message           TEXT NOT NULL DEFAULT '',
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at      TIMESTAMPTZ,
    opened_at         TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'failed', 'bounced'))
);

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_type ON notification_log(notification_type);
CREATE INDEX idx_notification_log_sent_at ON notification_log(sent_at);
CREATE INDEX idx_notification_log_status ON notification_log(status);

-- ============================================================
-- FEATURE EVENTS (analytics)
-- ============================================================

CREATE TABLE feature_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_feature_events_user_id ON feature_events(user_id);
CREATE INDEX idx_feature_events_type ON feature_events(event_type);
CREATE INDEX idx_feature_events_occurred_at ON feature_events(occurred_at);

-- ============================================================
-- GUEST CODE VIEWS (grandparent code access tracking)
-- ============================================================

CREATE TABLE guest_code_views (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id      UUID REFERENCES guests(id) ON DELETE SET NULL,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    copied        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_guest_code_views_guest_id ON guest_code_views(guest_id);
CREATE INDEX idx_guest_code_views_tournament_id ON guest_code_views(tournament_id);

-- ============================================================
-- APP SESSIONS
-- ============================================================

CREATE TABLE app_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    screen_path JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_app_sessions_user_id ON app_sessions(user_id);
CREATE INDEX idx_app_sessions_started_at ON app_sessions(started_at);

-- ============================================================
-- RLS for admin tables
-- ============================================================

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_code_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own notification log
CREATE POLICY "Users read own notifications"
    ON notification_log FOR SELECT
    USING (auth.uid() = user_id);

-- Service role inserts notifications (edge functions)
CREATE POLICY "Service inserts notifications"
    ON notification_log FOR INSERT
    WITH CHECK (true);

-- Feature events: service role insert, user read own
CREATE POLICY "Users read own feature events"
    ON feature_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service inserts feature events"
    ON feature_events FOR INSERT
    WITH CHECK (true);

-- Guest code views: open insert (no auth for guest web view), admin read
CREATE POLICY "Anyone inserts guest code views"
    ON guest_code_views FOR INSERT
    WITH CHECK (true);

-- App sessions: user manages own
CREATE POLICY "Users manage own sessions"
    ON app_sessions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Admin users: only admins read
CREATE POLICY "Admins read admin users"
    ON admin_users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.email = auth.jwt()->>'email'
        )
    );
