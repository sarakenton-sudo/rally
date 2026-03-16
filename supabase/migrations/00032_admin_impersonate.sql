-- Admin impersonation: generate a magic link for a target user
-- Only callable by admin users (owner role)
-- Returns a one-time login URL the admin can open to see the consumer app as that user

CREATE OR REPLACE FUNCTION admin_generate_impersonation_link(target_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_email TEXT;
  admin_user_role TEXT;
  target_email TEXT;
BEGIN
  -- Verify caller is admin owner
  SELECT email INTO admin_email FROM admin_users WHERE email = auth.jwt()->>'email';
  IF admin_email IS NULL THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;

  SELECT role INTO admin_user_role FROM admin_users WHERE email = admin_email;
  IF admin_user_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can impersonate users';
  END IF;

  -- Get target user email
  SELECT au.email::TEXT INTO target_email FROM auth.users au WHERE au.id = target_user_id;
  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Log the impersonation action
  INSERT INTO admin_audit_log (admin_user_id, action, target_table, target_id, metadata)
  SELECT au.id, 'impersonate_user', 'auth.users', target_user_id, jsonb_build_object('target_email', target_email)
  FROM admin_users au WHERE au.email = admin_email;

  RETURN target_email;
END;
$$;
