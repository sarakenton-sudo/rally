-- FIX: Admin read-all RLS policies are leaking into consumer app
-- Remove broad admin SELECT policies on consumer tables.
-- Admin panel will use SECURITY DEFINER RPCs instead.

DROP POLICY IF EXISTS "Admins read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins read all athletes" ON athletes;
DROP POLICY IF EXISTS "Admins read all seasons" ON seasons;
DROP POLICY IF EXISTS "Admins read all tournaments" ON tournaments;
DROP POLICY IF EXISTS "Admins read all hotels" ON hotel_bookings;
DROP POLICY IF EXISTS "Admins read all flights" ON flight_bookings;
DROP POLICY IF EXISTS "Admins read all feature events" ON feature_events;
DROP POLICY IF EXISTS "Admins read all notifications" ON notification_log;
DROP POLICY IF EXISTS "Admins read all sessions" ON app_sessions;
DROP POLICY IF EXISTS "Admins read all guest views" ON guest_code_views;

-- Keep admin update on feature_events but scope it via RPC instead
DROP POLICY IF EXISTS "Admins update feature events" ON feature_events;

-- Create admin RPCs for data the admin panel needs

-- Admin: list all feature requests
CREATE OR REPLACE FUNCTION admin_list_feature_requests(
  status_filter TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  event_type TEXT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB,
  status TEXT,
  admin_response TEXT,
  responded_by UUID,
  responded_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT fe.id, fe.user_id, fe.event_type, fe.occurred_at, fe.metadata,
         fe.status, fe.admin_response, fe.responded_by, fe.responded_at
  FROM feature_events fe
  WHERE fe.event_type = 'feature_request'
    AND (status_filter IS NULL OR fe.status = status_filter)
  ORDER BY fe.occurred_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- Admin: update feature request status
CREATE OR REPLACE FUNCTION admin_update_feature_request(
  request_id UUID,
  new_status TEXT,
  response_text TEXT DEFAULT NULL,
  admin_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE feature_events SET
    status = new_status,
    admin_response = response_text,
    responded_by = admin_id,
    responded_at = now()
  WHERE id = request_id;
END;
$$;

-- Admin: list errors
CREATE OR REPLACE FUNCTION admin_list_errors(
  status_filter TEXT DEFAULT NULL,
  severity_filter TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  screen TEXT,
  action TEXT,
  error_type TEXT,
  error_message TEXT,
  stack_trace TEXT,
  severity TEXT,
  status TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT el.id, el.user_id, el.screen, el.action, el.error_type, el.error_message,
         el.stack_trace, el.severity, el.status, el.resolved_by, el.resolved_at, el.created_at
  FROM error_log el
  WHERE (status_filter IS NULL OR el.status = status_filter)
    AND (severity_filter IS NULL OR el.severity = severity_filter)
  ORDER BY el.created_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- Admin: resolve/review error
CREATE OR REPLACE FUNCTION admin_update_error(
  error_id UUID,
  new_status TEXT,
  admin_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE error_log SET
    status = new_status,
    resolved_by = CASE WHEN new_status = 'resolved' THEN admin_id ELSE resolved_by END,
    resolved_at = CASE WHEN new_status = 'resolved' THEN now() ELSE resolved_at END
  WHERE id = error_id;
END;
$$;

-- Admin: session stats
CREATE OR REPLACE FUNCTION admin_session_stats(days_back INT DEFAULT 30)
RETURNS TABLE (started_at TIMESTAMPTZ, user_id UUID)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT s.started_at, s.user_id
  FROM app_sessions s
  WHERE s.started_at >= now() - (days_back || ' days')::interval
  ORDER BY s.started_at ASC;
$$;

-- Admin: notification stats
CREATE OR REPLACE FUNCTION admin_notification_stats(days_back INT DEFAULT 30)
RETURNS TABLE (sent_at TIMESTAMPTZ, status TEXT, channel TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT nl.sent_at, nl.status, nl.channel
  FROM notification_log nl
  WHERE nl.sent_at >= now() - (days_back || ' days')::interval
  ORDER BY nl.sent_at ASC;
$$;

-- Admin: dashboard counts
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS TABLE (
  total_users BIGINT,
  active_sessions_week BIGINT,
  pending_errors BIGINT,
  pending_feature_requests BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    (SELECT count(*) FROM auth.users) AS total_users,
    (SELECT count(*) FROM app_sessions WHERE started_at >= now() - interval '7 days') AS active_sessions_week,
    (SELECT count(*) FROM error_log WHERE status = 'new') AS pending_errors,
    (SELECT count(*) FROM feature_events WHERE event_type = 'feature_request' AND status = 'new') AS pending_feature_requests;
$$;

-- Admin: list forwarded emails (for import report)
CREATE OR REPLACE FUNCTION admin_list_emails(
  source_filter TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  from_address TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  classification TEXT,
  action_taken TEXT,
  source TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT fe.id, fe.user_id, fe.from_address, fe.subject, fe.received_at,
         fe.classification::TEXT, fe.action_taken::TEXT, fe.source, fe.created_at
  FROM forwarded_emails fe
  WHERE (source_filter IS NULL OR fe.source = source_filter)
  ORDER BY fe.received_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- Admin: list admin notes
CREATE OR REPLACE FUNCTION admin_list_notes(target_id UUID)
RETURNS TABLE (id UUID, admin_user_id UUID, note TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT an.id, an.admin_user_id, an.note, an.created_at
  FROM admin_notes an
  WHERE an.target_user_id = target_id
  ORDER BY an.created_at DESC;
$$;
