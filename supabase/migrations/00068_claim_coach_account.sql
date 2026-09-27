-- ============================================================
-- claim_coach_account — make the caller's account a coach account.
--
-- Email sign-up passes account_type in user metadata (handle_new_user reads it),
-- but Google OAuth creates the user with no metadata, so coaches who chose
-- "Coach" and continued with Google landed in parent onboarding. The app now
-- remembers the choice across the OAuth redirect and calls this afterwards.
--
-- Guard: only accounts that haven't set up the parent side (no admin_config).
-- Existing parents who also coach use Hub → Coach Mode instead.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_coach_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;
    IF EXISTS (SELECT 1 FROM admin_config WHERE user_id = auth.uid()) THEN
        RETURN false;
    END IF;
    UPDATE user_profiles SET account_type = 'coach' WHERE id = auth.uid();
    RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_coach_account() TO authenticated;
