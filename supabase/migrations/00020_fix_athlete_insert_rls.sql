-- Fix: allow any authenticated user to insert athletes
-- The old policy required a user_profiles record with role='admin' which may not exist
DROP POLICY IF EXISTS "Admins manage athletes" ON athletes;

CREATE POLICY "Authenticated users insert athletes"
    ON athletes FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Also ensure user_profiles exists for current users (backfill if missing)
INSERT INTO user_profiles (id, role, display_name)
SELECT id, 'admin', NULL FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles)
ON CONFLICT (id) DO NOTHING;
