-- ============================================================
-- SECURITY: admin functions were callable by anyone (even signed out, with
-- the public key) — e.g. admin_list_users returned every user's email.
-- Every admin_* function now starts with assert_admin(), which refuses
-- anyone not in admin_users. Signed-out access is revoked too.
-- ============================================================
CREATE OR REPLACE FUNCTION assert_admin() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email') THEN
        RAISE EXCEPTION 'Not an admin' USING ERRCODE = '42501';
    END IF;
    RETURN true;
END;
$$;

-- admin_dashboard_stats (from 00035_referral_stats_and_trigger.sql)
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS TABLE (
  total_users BIGINT,
  active_sessions_week BIGINT,
  pending_errors BIGINT,
  pending_feature_requests BIGINT,
  total_referrals BIGINT,
  converted_referrals BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT
    (SELECT count(*) FROM auth.users) AS total_users,
    (SELECT count(*) FROM app_sessions WHERE started_at >= now() - interval '7 days') AS active_sessions_week,
    (SELECT count(*) FROM error_log WHERE status = 'new') AS pending_errors,
    (SELECT count(*) FROM feature_events WHERE event_type = 'feature_request' AND status = 'new') AS pending_feature_requests,
    (SELECT count(*) FROM referrals) AS total_referrals,
    (SELECT count(*) FROM referrals WHERE status IN ('signed_up', 'active')) AS converted_referrals;
$$;

-- admin_get_email_template (from 00036_email_templates.sql)
CREATE OR REPLACE FUNCTION admin_get_email_template(template_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  subject TEXT,
  html_body TEXT,
  variables JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT id, slug, name, subject, html_body, variables, updated_at
  FROM email_templates
  WHERE id = template_id;
$$;

-- admin_get_notification_template (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_get_notification_template(template_id UUID)
RETURNS TABLE (
    id               UUID,
    slug             TEXT,
    category         TEXT,
    channels         TEXT[],
    title_template   TEXT,
    body_template    TEXT,
    title_char_limit INT,
    body_char_limit  INT,
    variables        JSONB,
    is_active        BOOLEAN,
    status           TEXT,
    version          INT,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    updated_by       UUID
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
    SELECT
        nt.id, nt.slug, nt.category, nt.channels,
        nt.title_template, nt.body_template,
        nt.title_char_limit, nt.body_char_limit,
        nt.variables, nt.is_active, nt.status, nt.version,
        nt.created_at, nt.updated_at, nt.updated_by
    FROM notification_templates nt
    WHERE nt.id = template_id;
$$;

-- admin_import_report (from 00031_import_tracking_rpc.sql)
CREATE OR REPLACE FUNCTION admin_import_report(
  type_filter TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  event_type TEXT,
  import_type TEXT,
  item_count INT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB,
  was_completed BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT
    a.id,
    a.user_id,
    au.email::TEXT AS user_email,
    a.event_type,
    (a.metadata->>'type')::TEXT AS import_type,
    COALESCE((a.metadata->>'item_count')::INT, 1) AS item_count,
    a.occurred_at,
    a.metadata,
    EXISTS (
      SELECT 1 FROM feature_events c
      WHERE c.user_id = a.user_id
        AND c.event_type = 'import_completed'
        AND c.metadata->>'type' = a.metadata->>'type'
        AND c.occurred_at > a.occurred_at
        AND c.occurred_at < a.occurred_at + interval '30 minutes'
    ) AS was_completed
  FROM feature_events a
  JOIN auth.users au ON au.id = a.user_id
  WHERE a.event_type = 'import_attempt'
    AND (type_filter IS NULL
      OR a.metadata->>'type' ILIKE '%' || type_filter || '%')
  ORDER BY a.occurred_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_delivery_log (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_list_delivery_log(
    channel_filter  TEXT DEFAULT NULL,
    type_filter     TEXT DEFAULT NULL,
    status_filter   TEXT DEFAULT NULL,
    date_from       TIMESTAMPTZ DEFAULT NULL,
    date_to         TIMESTAMPTZ DEFAULT NULL,
    page_size       INT DEFAULT 50,
    page_offset     INT DEFAULT 0
)
RETURNS TABLE (
    id                UUID,
    user_id           UUID,
    user_email        TEXT,
    tournament_id     UUID,
    notification_type TEXT,
    channel           TEXT,
    message           TEXT,
    status            TEXT,
    sent_at           TIMESTAMPTZ,
    delivered_at      TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
    SELECT
        nl.id,
        nl.user_id,
        u.email::TEXT AS user_email,
        nl.tournament_id,
        nl.notification_type,
        nl.channel,
        nl.message,
        nl.status,
        nl.sent_at,
        nl.delivered_at
    FROM notification_log nl
    LEFT JOIN auth.users u ON u.id = nl.user_id
    WHERE (channel_filter IS NULL OR nl.channel = channel_filter)
      AND (type_filter IS NULL OR nl.notification_type = type_filter)
      AND (status_filter IS NULL OR nl.status = status_filter)
      AND (date_from IS NULL OR nl.sent_at >= date_from)
      AND (date_to IS NULL OR nl.sent_at <= date_to)
    ORDER BY nl.sent_at DESC
    LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_email_templates (from 00036_email_templates.sql)
CREATE OR REPLACE FUNCTION admin_list_email_templates()
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  subject TEXT,
  variables JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT id, slug, name, subject, variables, updated_at
  FROM email_templates
  ORDER BY name ASC;
$$;

-- admin_list_emails (from 00030_fix_admin_rls_leaking.sql)
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
  SELECT assert_admin();
  SELECT fe.id, fe.user_id, fe.from_address, fe.subject, fe.received_at,
         fe.classification::TEXT, fe.action_taken::TEXT, fe.source, fe.created_at
  FROM forwarded_emails fe
  WHERE (source_filter IS NULL OR fe.source = source_filter)
  ORDER BY fe.received_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_errors (from 00030_fix_admin_rls_leaking.sql)
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
  SELECT assert_admin();
  SELECT el.id, el.user_id, el.screen, el.action, el.error_type, el.error_message,
         el.stack_trace, el.severity, el.status, el.resolved_by, el.resolved_at, el.created_at
  FROM error_log el
  WHERE (status_filter IS NULL OR el.status = status_filter)
    AND (severity_filter IS NULL OR el.severity = severity_filter)
  ORDER BY el.created_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_feature_requests (from 00030_fix_admin_rls_leaking.sql)
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
  SELECT assert_admin();
  SELECT fe.id, fe.user_id, fe.event_type, fe.occurred_at, fe.metadata,
         fe.status, fe.admin_response, fe.responded_by, fe.responded_at
  FROM feature_events fe
  WHERE fe.event_type = 'feature_request'
    AND (status_filter IS NULL OR fe.status = status_filter)
  ORDER BY fe.occurred_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_notes (from 00030_fix_admin_rls_leaking.sql)
CREATE OR REPLACE FUNCTION admin_list_notes(target_id UUID)
RETURNS TABLE (id UUID, admin_user_id UUID, note TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT an.id, an.admin_user_id, an.note, an.created_at
  FROM admin_notes an
  WHERE an.target_user_id = target_id
  ORDER BY an.created_at DESC;
$$;

-- admin_list_notification_templates (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_list_notification_templates(
    channel_filter  TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    status_filter   TEXT DEFAULT NULL,
    page_size       INT DEFAULT 50,
    page_offset     INT DEFAULT 0
)
RETURNS TABLE (
    id               UUID,
    slug             TEXT,
    category         TEXT,
    channels         TEXT[],
    title_template   TEXT,
    body_template    TEXT,
    title_char_limit INT,
    body_char_limit  INT,
    variables        JSONB,
    is_active        BOOLEAN,
    status           TEXT,
    version          INT,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    updated_by       UUID,
    version_count    BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
    SELECT
        nt.id, nt.slug, nt.category, nt.channels,
        nt.title_template, nt.body_template,
        nt.title_char_limit, nt.body_char_limit,
        nt.variables, nt.is_active, nt.status, nt.version,
        nt.created_at, nt.updated_at, nt.updated_by,
        (SELECT count(*) FROM notification_template_versions v WHERE v.template_id = nt.id) AS version_count
    FROM notification_templates nt
    WHERE (channel_filter IS NULL OR nt.channels && ARRAY[channel_filter])
      AND (category_filter IS NULL OR nt.category = category_filter)
      AND (status_filter IS NULL OR nt.status = status_filter)
    ORDER BY nt.created_at ASC
    LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_referrals (from 00034_referrals.sql)
CREATE OR REPLACE FUNCTION admin_list_referrals(
    page_size   INT DEFAULT 50,
    page_offset INT DEFAULT 0
)
RETURNS TABLE (
    id               UUID,
    referrer_user_id UUID,
    referrer_email   TEXT,
    referred_email   TEXT,
    referred_phone   TEXT,
    status           TEXT,
    created_at       TIMESTAMPTZ,
    converted_at     TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
    SELECT
        r.id,
        r.referrer_user_id,
        u.email::TEXT AS referrer_email,
        r.referred_email,
        r.referred_phone,
        r.status,
        r.created_at,
        r.converted_at
    FROM referrals r
    JOIN auth.users u ON u.id = r.referrer_user_id
    ORDER BY r.created_at DESC
    LIMIT page_size OFFSET page_offset;
$$;

-- admin_list_template_versions (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_list_template_versions(p_template_id UUID)
RETURNS TABLE (
    id             UUID,
    template_id    UUID,
    version        INT,
    title_template TEXT,
    body_template  TEXT,
    channels       TEXT[],
    is_active      BOOLEAN,
    status         TEXT,
    changed_by     UUID,
    changed_at     TIMESTAMPTZ,
    change_note    TEXT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
    SELECT
        v.id, v.template_id, v.version,
        v.title_template, v.body_template,
        v.channels, v.is_active, v.status,
        v.changed_by, v.changed_at, v.change_note
    FROM notification_template_versions v
    WHERE v.template_id = p_template_id
    ORDER BY v.version DESC;
$$;

-- admin_list_users (from 00035_referral_stats_and_trigger.sql)
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
  session_count BIGINT,
  referral_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT assert_admin();
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
    (SELECT count(*) FROM app_sessions s WHERE s.user_id = au.id) AS session_count,
    (SELECT count(*) FROM referrals r WHERE r.referrer_user_id = au.id) AS referral_count
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  WHERE (search_query IS NULL OR au.email ILIKE '%' || search_query || '%'
    OR up.display_name ILIKE '%' || search_query || '%')
  ORDER BY au.created_at DESC
  LIMIT page_size OFFSET page_offset;
$$;

-- admin_notification_stats (from 00030_fix_admin_rls_leaking.sql)
CREATE OR REPLACE FUNCTION admin_notification_stats(days_back INT DEFAULT 30)
RETURNS TABLE (sent_at TIMESTAMPTZ, status TEXT, channel TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT nl.sent_at, nl.status, nl.channel
  FROM notification_log nl
  WHERE nl.sent_at >= now() - (days_back || ' days')::interval
  ORDER BY nl.sent_at ASC;
$$;

-- admin_revert_notification_template (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_revert_notification_template(
    p_template_id  UUID,
    target_version INT,
    admin_id       UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    current_record notification_templates%ROWTYPE;
    old_version    notification_template_versions%ROWTYPE;
BEGIN
  PERFORM assert_admin();
    -- Fetch current state
    SELECT * INTO current_record FROM notification_templates WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    -- Fetch the target version
    SELECT * INTO old_version
    FROM notification_template_versions
    WHERE template_id = p_template_id AND version = target_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version % not found for template %', target_version, p_template_id;
    END IF;

    -- Archive current state before reverting
    INSERT INTO notification_template_versions (
        template_id, version, title_template, body_template,
        channels, is_active, status, changed_by, change_note
    ) VALUES (
        current_record.id, current_record.version, current_record.title_template, current_record.body_template,
        current_record.channels, current_record.is_active, current_record.status, admin_id,
        'Reverted to version ' || target_version
    );

    -- Apply the old version values and bump version counter
    UPDATE notification_templates SET
        title_template = old_version.title_template,
        body_template  = old_version.body_template,
        channels       = old_version.channels,
        is_active      = old_version.is_active,
        status         = old_version.status,
        version        = current_record.version + 1,
        updated_by     = admin_id
    WHERE id = p_template_id;
END;
$$;

-- admin_session_stats (from 00030_fix_admin_rls_leaking.sql)
CREATE OR REPLACE FUNCTION admin_session_stats(days_back INT DEFAULT 30)
RETURNS TABLE (started_at TIMESTAMPTZ, user_id UUID)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT assert_admin();
  SELECT s.started_at, s.user_id
  FROM app_sessions s
  WHERE s.started_at >= now() - (days_back || ' days')::interval
  ORDER BY s.started_at ASC;
$$;

-- admin_update_email_template (from 00036_email_templates.sql)
CREATE OR REPLACE FUNCTION admin_update_email_template(
  template_id UUID,
  new_subject TEXT,
  new_html_body TEXT,
  admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_admin();
  UPDATE email_templates
  SET subject = new_subject,
      html_body = new_html_body,
      updated_at = now(),
      updated_by = admin_id
  WHERE id = template_id;
END;
$$;

-- admin_update_error (from 00030_fix_admin_rls_leaking.sql)
CREATE OR REPLACE FUNCTION admin_update_error(
  error_id UUID,
  new_status TEXT,
  admin_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_admin();
  UPDATE error_log SET
    status = new_status,
    resolved_by = CASE WHEN new_status = 'resolved' THEN admin_id ELSE resolved_by END,
    resolved_at = CASE WHEN new_status = 'resolved' THEN now() ELSE resolved_at END
  WHERE id = error_id;
END;
$$;

-- admin_update_feature_request (from 00030_fix_admin_rls_leaking.sql)
CREATE OR REPLACE FUNCTION admin_update_feature_request(
  request_id UUID,
  new_status TEXT,
  response_text TEXT DEFAULT NULL,
  admin_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_admin();
  UPDATE feature_events SET
    status = new_status,
    admin_response = response_text,
    responded_by = admin_id,
    responded_at = now()
  WHERE id = request_id;
END;
$$;

-- admin_update_notification_template (from 00033_notification_center.sql)
CREATE OR REPLACE FUNCTION admin_update_notification_template(
    p_template_id  UUID,
    new_title      TEXT,
    new_body       TEXT,
    new_is_active  BOOLEAN,
    new_status     TEXT,
    admin_id       UUID,
    change_note    TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    old_record notification_templates%ROWTYPE;
BEGIN
  PERFORM assert_admin();
    -- Fetch current state
    SELECT * INTO old_record FROM notification_templates WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    -- Archive current version
    INSERT INTO notification_template_versions (
        template_id, version, title_template, body_template,
        channels, is_active, status, changed_by, change_note
    ) VALUES (
        old_record.id, old_record.version, old_record.title_template, old_record.body_template,
        old_record.channels, old_record.is_active, old_record.status, admin_id, change_note
    );

    -- Update template with new values and bump version
    UPDATE notification_templates SET
        title_template = new_title,
        body_template  = new_body,
        is_active      = new_is_active,
        status         = new_status,
        version        = old_record.version + 1,
        updated_by     = admin_id
    WHERE id = p_template_id;
END;
$$;


-- No signed-out access to any admin function.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_%' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
  END LOOP;
END $$;
