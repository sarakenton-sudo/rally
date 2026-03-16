-- ============================================================
-- Referral stats in admin dashboard + auto-convert on signup
-- ============================================================

-- 1. Update admin_dashboard_stats to include referral counts
DROP FUNCTION IF EXISTS admin_dashboard_stats();
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
  SELECT
    (SELECT count(*) FROM auth.users) AS total_users,
    (SELECT count(*) FROM app_sessions WHERE started_at >= now() - interval '7 days') AS active_sessions_week,
    (SELECT count(*) FROM error_log WHERE status = 'new') AS pending_errors,
    (SELECT count(*) FROM feature_events WHERE event_type = 'feature_request' AND status = 'new') AS pending_feature_requests,
    (SELECT count(*) FROM referrals) AS total_referrals,
    (SELECT count(*) FROM referrals WHERE status IN ('signed_up', 'active')) AS converted_referrals;
$$;

-- 2. Add referral_count to admin_list_users
DROP FUNCTION IF EXISTS admin_list_users(TEXT, INT, INT);
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

-- 3. Trigger: when a new user signs up, check if their email matches a referral
CREATE OR REPLACE FUNCTION handle_referral_conversion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE referrals
  SET status = 'signed_up',
      converted_at = now()
  WHERE referred_email = NEW.email
    AND status = 'sent';
  RETURN NEW;
END;
$$;

-- Fire after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_user_created_check_referral ON auth.users;
CREATE TRIGGER on_user_created_check_referral
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_referral_conversion();

-- 4. Admin RLS on referrals table
CREATE POLICY "Admins read all referrals"
  ON referrals FOR SELECT USING (is_admin());
