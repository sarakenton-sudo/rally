-- Fix admin auth: create RPC for admin login check that bypasses RLS
-- The admin_users SELECT policy uses a self-referencing query which blocks
-- the initial auth check after login.

-- Drop the old self-referencing policy
DROP POLICY IF EXISTS "Admins read admin users" ON admin_users;

-- Replace with is_admin() which is SECURITY DEFINER
CREATE POLICY "Admins read admin users" ON admin_users
  FOR SELECT USING (is_admin());

-- RPC to get current user's admin record (bypasses RLS)
CREATE OR REPLACE FUNCTION get_admin_self()
RETURNS TABLE (id UUID, email TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT au.id, au.email, au.role
  FROM admin_users au
  WHERE au.email = auth.jwt()->>'email'
  LIMIT 1;
$$;
