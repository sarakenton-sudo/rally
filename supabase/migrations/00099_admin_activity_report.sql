-- ============================================================
-- Admin → Activity: one report for the admin panel.
-- Counts come from the real tables (so history is included and nothing is
-- missed, whether it was added in the app, on the web, or by email), plus
-- tracked actions from feature_events (with iPhone vs web).
-- Admins only (assert_admin, 00098).
-- ============================================================
CREATE OR REPLACE FUNCTION admin_activity_report(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_since TIMESTAMPTZ := now() - make_interval(days => GREATEST(1, LEAST(p_days, 365)));
    v JSONB;
BEGIN
    PERFORM assert_admin();

    SELECT jsonb_build_object(
      'days', GREATEST(1, LEAST(p_days, 365)),
      'generated_at', now(),

      -- ── People ──
      'people', jsonb_build_object(
        'users_total',      (SELECT count(*) FROM auth.users),
        'users_new',        (SELECT count(*) FROM auth.users WHERE created_at >= v_since),
        'parents_total',    (SELECT count(*) FROM user_profiles WHERE account_type = 'parent' AND role::text <> 'fan'),
        'coaches_total',    (SELECT count(*) FROM user_profiles WHERE account_type = 'coach'),
        'athlete_logins',   (SELECT count(*) FROM user_profiles WHERE account_type = 'athlete'),
        'fans_total',       (SELECT count(DISTINCT fan_user_id) FROM fans WHERE fan_user_id IS NOT NULL),
        'signed_in_7d',     (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '7 days'),
        'signed_in_30d',    (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days'),
        'active_today',     (SELECT count(DISTINCT user_id) FROM feature_events WHERE event_type = 'app_open' AND occurred_at >= date_trunc('day', now())),
        'active_7d',        (SELECT count(DISTINCT user_id) FROM feature_events WHERE event_type = 'app_open' AND occurred_at >= now() - interval '7 days'),
        'active_30d',       (SELECT count(DISTINCT user_id) FROM feature_events WHERE event_type = 'app_open' AND occurred_at >= now() - interval '30 days'),
        'active_by_platform', (SELECT COALESCE(jsonb_object_agg(pf, n), '{}'::jsonb) FROM (
            SELECT COALESCE(metadata->>'platform', 'unknown') pf, count(DISTINCT user_id) n
            FROM feature_events WHERE event_type = 'app_open' AND occurred_at >= v_since GROUP BY 1) x)
      ),

      -- ── What people added: [all time, in this period] ──
      'content', jsonb_build_object(
        'athletes',         jsonb_build_array((SELECT count(*) FROM athletes), (SELECT count(*) FROM athletes WHERE created_at >= v_since)),
        'tournaments',      jsonb_build_array((SELECT count(*) FROM tournaments), (SELECT count(*) FROM tournaments WHERE created_at >= v_since)),
        'games_events',     jsonb_build_array((SELECT count(*) FROM team_events), (SELECT count(*) FROM team_events WHERE created_at >= v_since)),
        'hotels',           jsonb_build_array((SELECT count(*) FROM hotel_bookings), (SELECT count(*) FROM hotel_bookings WHERE created_at >= v_since)),
        'flights',          jsonb_build_array((SELECT count(*) FROM flight_bookings), (SELECT count(*) FROM flight_bookings WHERE created_at >= v_since)),
        'emails_forwarded', jsonb_build_array((SELECT count(*) FROM forwarded_emails), (SELECT count(*) FROM forwarded_emails WHERE received_at >= v_since)),
        'fans_invited',     jsonb_build_array((SELECT count(*) FROM fans), (SELECT count(*) FROM fans WHERE created_at >= v_since)),
        'fans_joined',      jsonb_build_array((SELECT count(*) FROM fans WHERE fan_user_id IS NOT NULL), (SELECT count(*) FROM fans WHERE joined_at >= v_since)),
        'fan_updates',      jsonb_build_array((SELECT count(*) FROM tournament_updates), (SELECT count(*) FROM tournament_updates WHERE created_at >= v_since))
      ),

      -- ── Coaching: [all time, in this period] ──
      'coaching', jsonb_build_object(
        'coaches',              jsonb_build_array((SELECT count(*) FROM coaches), (SELECT count(*) FROM coaches WHERE created_at >= v_since)),
        'booking_pages_live',   (SELECT count(*) FROM coaches WHERE booking_page_published),
        'open_times_added',     jsonb_build_array((SELECT count(*) FROM slots), (SELECT count(*) FROM slots WHERE created_at >= v_since)),
        'families_connected',   jsonb_build_array((SELECT count(*) FROM coach_connections), (SELECT count(*) FROM coach_connections WHERE created_at >= v_since)),
        'lesson_requests',      jsonb_build_array((SELECT count(*) FROM booking_requests), (SELECT count(*) FROM booking_requests WHERE created_at >= v_since)),
        'requests_by_status',   (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM booking_requests WHERE created_at >= v_since GROUP BY 1) x),
        'lessons_booked',       jsonb_build_array((SELECT count(*) FROM bookings), (SELECT count(*) FROM bookings WHERE created_at >= v_since)),
        'lessons_cancelled',    (SELECT count(*) FROM bookings WHERE status = 'cancelled' AND created_at >= v_since),
        'lessons_paid',         (SELECT count(*) FROM bookings WHERE paid_at >= v_since),
        'paid_cents',           (SELECT COALESCE(sum(price_cents), 0) FROM bookings WHERE paid_at >= v_since),
        'booked_cents',         (SELECT COALESCE(sum(price_cents), 0) FROM bookings WHERE created_at >= v_since AND status <> 'cancelled')
      ),

      -- ── Day by day ──
      'daily', (SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb) FROM (
          SELECT g::date AS day,
            (SELECT count(*) FROM auth.users u WHERE u.created_at::date = g::date) AS signups,
            (SELECT count(DISTINCT e.user_id) FROM feature_events e WHERE e.event_type = 'app_open' AND e.occurred_at::date = g::date) AS active_users,
            (SELECT count(*) FROM tournaments t WHERE t.created_at::date = g::date) AS tournaments,
            (SELECT count(*) FROM hotel_bookings h WHERE h.created_at::date = g::date)
              + (SELECT count(*) FROM flight_bookings f WHERE f.created_at::date = g::date) AS travel,
            (SELECT count(*) FROM booking_requests r WHERE r.created_at::date = g::date)
              + (SELECT count(*) FROM bookings b WHERE b.created_at::date = g::date AND b.request_id NOT IN (SELECT id FROM booking_requests WHERE created_at::date = g::date)) AS lessons
          FROM generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') g
      ) d),

      -- ── Tracked actions (from the app and website), by platform ──
      'events', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
          SELECT event_type,
                 count(*) AS total,
                 count(DISTINCT user_id) AS users,
                 count(*) FILTER (WHERE metadata->>'platform' = 'ios') AS ios,
                 count(*) FILTER (WHERE metadata->>'platform' = 'android') AS android,
                 count(*) FILTER (WHERE metadata->>'platform' = 'web') AS web,
                 count(*) FILTER (WHERE metadata->>'platform' IS NULL) AS unknown
          FROM feature_events
          WHERE occurred_at >= v_since AND event_type <> 'feature_request'
          GROUP BY event_type) x),

      -- ── Funnels (people who signed up in this period) ──
      'parent_funnel', (SELECT jsonb_build_object(
          'signed_up',        count(*),
          'finished_setup',   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM admin_athletes aa WHERE aa.admin_id = u.id)),
          'added_tournament', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM admin_athletes aa JOIN seasons s ON s.athlete_id = aa.athlete_id JOIN tournaments t ON t.season_id = s.id WHERE aa.admin_id = u.id)),
          'added_travel',     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM hotel_bookings h WHERE h.created_by_user_id = u.id) OR EXISTS (SELECT 1 FROM flight_bookings f WHERE f.created_by_user_id = u.id)),
          'invited_fan',      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM fans fn WHERE fn.owner_id = u.id)),
          'booked_lesson',    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM booking_requests br WHERE br.parent_user_id = u.id))
        ) FROM auth.users u JOIN user_profiles up ON up.id = u.id
        WHERE u.created_at >= v_since AND up.account_type = 'parent' AND up.role::text <> 'fan'),

      'coach_funnel', (SELECT jsonb_build_object(
          'signed_up',           count(*),
          'created_page',        count(*) FILTER (WHERE c.id IS NOT NULL),
          'added_lesson_types',  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM session_types st WHERE st.coach_id = c.id)),
          'added_open_times',    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM slots sl WHERE sl.coach_id = c.id)),
          'published_page',      count(*) FILTER (WHERE c.booking_page_published),
          'first_booking',       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM booking_requests br WHERE br.coach_id = c.id))
        ) FROM auth.users u JOIN user_profiles up ON up.id = u.id
        LEFT JOIN coaches c ON c.user_id = u.id
        WHERE u.created_at >= v_since AND up.account_type = 'coach'),

      -- ── Most active people in this period (tracked actions) ──
      'top_users', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.actions DESC), '[]'::jsonb) FROM (
          SELECT u.email::text AS email, up.account_type, count(*) AS actions,
                 max(e.occurred_at) AS last_seen,
                 mode() WITHIN GROUP (ORDER BY e.metadata->>'platform') AS platform
          FROM feature_events e JOIN auth.users u ON u.id = e.user_id LEFT JOIN user_profiles up ON up.id = u.id
          WHERE e.occurred_at >= v_since
          GROUP BY u.email, up.account_type
          ORDER BY count(*) DESC LIMIT 15) x)
    ) INTO v;
    RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION admin_activity_report(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_activity_report(INT) TO authenticated;

-- Dashboard "Active (7d)": people who opened the app or website in the last
-- week (app_sessions stopped being written long ago).
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
    (SELECT count(DISTINCT user_id) FROM feature_events WHERE event_type = 'app_open' AND occurred_at >= now() - interval '7 days') AS active_sessions_week,
    (SELECT count(*) FROM error_log WHERE status = 'new') AS pending_errors,
    (SELECT count(*) FROM feature_events WHERE event_type = 'feature_request' AND status = 'new') AS pending_feature_requests,
    (SELECT count(*) FROM referrals) AS total_referrals,
    (SELECT count(*) FROM referrals WHERE status IN ('signed_up', 'active')) AS converted_referrals;
$$;
