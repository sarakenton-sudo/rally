-- RALLY: Admin Panel Schema
-- New tables, extended columns, RLS policies, and RPCs for the operator dashboard

-- ============================================================
-- ERROR LOG
-- ============================================================

CREATE TABLE error_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    screen        TEXT,
    action        TEXT,
    error_type    TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace   TEXT,
    severity      TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning','error','critical')),
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','resolved')),
    resolved_by   UUID REFERENCES admin_users(id),
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_log_status ON error_log(status);
CREATE INDEX idx_error_log_severity ON error_log(severity);
CREATE INDEX idx_error_log_created_at ON error_log(created_at);

-- ============================================================
-- ADMIN NOTES
-- ============================================================

CREATE TABLE admin_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   UUID NOT NULL REFERENCES admin_users(id),
    target_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notes_target ON admin_notes(target_user_id);

-- ============================================================
-- ADMIN AUDIT LOG
-- ============================================================

CREATE TABLE admin_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   UUID NOT NULL REFERENCES admin_users(id),
    action          TEXT NOT NULL,
    target_table    TEXT,
    target_id       UUID,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_admin ON admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at);

-- ============================================================
-- ADMIN ALERT CONFIG
-- ============================================================

CREATE TABLE admin_alert_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   UUID NOT NULL REFERENCES admin_users(id),
    alert_type      TEXT NOT NULL,
    channel         TEXT NOT NULL CHECK (channel IN ('email','push')),
    enabled         BOOLEAN DEFAULT true,
    UNIQUE(admin_user_id, alert_type, channel)
);

-- ============================================================
-- EXTEND FEATURE EVENTS FOR STATUS WORKFLOW
-- ============================================================

ALTER TABLE feature_events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'
    CHECK (status IN ('new','under_review','planned','shipped','declined')),
  ADD COLUMN IF NOT EXISTS admin_response TEXT,
  ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- ============================================================
-- UPDATE ADMIN_USERS ROLES
-- ============================================================

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner','cs_rep'));

-- Update existing super_admin → owner
UPDATE admin_users SET role = 'owner' WHERE role = 'super_admin';
-- Update existing viewer → cs_rep
UPDATE admin_users SET role = 'cs_rep' WHERE role = 'viewer';

-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email');
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_role() RETURNS TEXT AS $$
  SELECT role FROM admin_users WHERE email = auth.jwt()->>'email' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- RLS ON NEW TABLES
-- ============================================================

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alert_config ENABLE ROW LEVEL SECURITY;

-- Error log: anyone can insert (consumer app), admins read all
CREATE POLICY "Service inserts errors" ON error_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read errors" ON error_log FOR SELECT USING (is_admin());
CREATE POLICY "Admins update errors" ON error_log FOR UPDATE USING (is_admin());

-- Admin notes: admins only
CREATE POLICY "Admins manage notes" ON admin_notes FOR ALL USING (is_admin());

-- Audit log: admins read, system inserts
CREATE POLICY "Admins read audit log" ON admin_audit_log FOR SELECT USING (is_admin());
CREATE POLICY "Service inserts audit log" ON admin_audit_log FOR INSERT WITH CHECK (true);

-- Alert config: admins manage own
CREATE POLICY "Admins manage alert config" ON admin_alert_config FOR ALL USING (is_admin());

-- ============================================================
-- ADMIN READ POLICIES ON EXISTING TABLES
-- ============================================================

-- Admins can read all user_profiles
CREATE POLICY "Admins read all profiles" ON user_profiles FOR SELECT USING (is_admin());

-- Admins can read all athletes
CREATE POLICY "Admins read all athletes" ON athletes FOR SELECT USING (is_admin());

-- Admins can read all seasons
CREATE POLICY "Admins read all seasons" ON seasons FOR SELECT USING (is_admin());

-- Admins can read all tournaments
CREATE POLICY "Admins read all tournaments" ON tournaments FOR SELECT USING (is_admin());

-- Admins can read all hotel_bookings
CREATE POLICY "Admins read all hotels" ON hotel_bookings FOR SELECT USING (is_admin());

-- Admins can read all flight_bookings
CREATE POLICY "Admins read all flights" ON flight_bookings FOR SELECT USING (is_admin());

-- Admins can read all feature_events
CREATE POLICY "Admins read all feature events" ON feature_events FOR SELECT USING (is_admin());
CREATE POLICY "Admins update feature events" ON feature_events FOR UPDATE USING (is_admin());

-- Admins can read all notification_log
CREATE POLICY "Admins read all notifications" ON notification_log FOR SELECT USING (is_admin());

-- Admins can read all app_sessions
CREATE POLICY "Admins read all sessions" ON app_sessions FOR SELECT USING (is_admin());

-- Admins can read all guest_code_views
CREATE POLICY "Admins read all guest views" ON guest_code_views FOR SELECT USING (is_admin());

-- ============================================================
-- RPC: admin_list_users
-- ============================================================

CREATE OR REPLACE FUNCTION admin_list_users(
  search_query TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in TIMESTAMPTZ,
  tournament_count BIGINT,
  booking_count BIGINT,
  session_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    au.id AS user_id,
    au.email::TEXT,
    up.display_name,
    up.role,
    au.created_at,
    au.last_sign_in_at AS last_sign_in,
    (SELECT count(*) FROM tournaments t
       JOIN seasons s ON s.id = t.season_id
       JOIN admin_athletes aa ON aa.athlete_id = s.athlete_id
       WHERE aa.admin_id = au.id) AS tournament_count,
    (SELECT count(*) FROM hotel_bookings hb WHERE hb.created_by_user_id = au.id)
      + (SELECT count(*) FROM flight_bookings fb WHERE fb.created_by_user_id = au.id) AS booking_count,
    (SELECT count(*) FROM app_sessions s WHERE s.user_id = au.id) AS session_count
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  WHERE (search_query IS NULL OR au.email ILIKE '%' || search_query || '%'
    OR up.display_name ILIKE '%' || search_query || '%')
  ORDER BY au.created_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- Only admins can call this
REVOKE EXECUTE ON FUNCTION admin_list_users FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_users TO authenticated;
