-- Fix signup trigger: add search_path and exception handling
-- so referral conversion errors never block account creation

CREATE OR REPLACE FUNCTION handle_referral_conversion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE referrals
    SET status = 'signed_up',
        converted_at = now()
    WHERE referred_email = NEW.email
      AND status = 'sent';
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't block signup
    RAISE WARNING 'referral conversion failed for %: %', NEW.email, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
