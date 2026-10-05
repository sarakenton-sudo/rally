-- ============================================================
-- Marketing consent (email). Recorded at sign-up (pre-checked for parents
-- and coaches; never for athlete accounts, who may be minors) and changeable
-- in Settings. Every change is logged with time, source and the exact
-- wording shown, for proof of consent. Transactional messages (lesson
-- changes, reminders, receipts, invites) don't depend on this.
-- SMS marketing is separate and must be an unchecked, explicit opt-in
-- (TCPA / carrier 10DLC rules) — not built until texting goes live.
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS marketing_email_opt_in BOOLEAN;   -- NULL = never asked
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS marketing_email_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS marketing_consent_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    opted_in    BOOLEAN NOT NULL,
    source      TEXT NOT NULL,          -- signup_email | signup_google | settings | unsubscribe_link | athlete_account
    consent_text TEXT,                  -- exactly what the person saw
    platform    TEXT,                   -- web | ios | android
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_consent_user ON marketing_consent_events(user_id, created_at DESC);

ALTER TABLE marketing_consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own consent history" ON marketing_consent_events;
CREATE POLICY "Users read own consent history" ON marketing_consent_events FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins read consent history" ON marketing_consent_events;
CREATE POLICY "Admins read consent history" ON marketing_consent_events FOR SELECT USING (is_admin());
-- Writes only through set_marketing_consent.

CREATE OR REPLACE FUNCTION set_marketing_consent(
    p_opt_in BOOLEAN, p_source TEXT, p_consent_text TEXT DEFAULT NULL, p_platform TEXT DEFAULT NULL,
    p_only_if_unset BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role    TEXT;
    v_current BOOLEAN;
    v_value   BOOLEAN := p_opt_in;
    v_source  TEXT := p_source;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT role, marketing_email_opt_in INTO v_role, v_current FROM user_profiles WHERE id = auth.uid();
    -- Sign-up records once; it never overwrites a choice made later in Settings.
    IF p_only_if_unset AND v_current IS NOT NULL THEN RETURN v_current; END IF;
    -- Athletes may be minors: never opted in to marketing.
    IF v_role = 'athlete' THEN v_value := false; v_source := 'athlete_account'; END IF;

    UPDATE user_profiles SET marketing_email_opt_in = v_value, marketing_email_updated_at = now() WHERE id = auth.uid();
    INSERT INTO marketing_consent_events (user_id, channel, opted_in, source, consent_text, platform)
    VALUES (auth.uid(), 'email', v_value, v_source, p_consent_text, p_platform);
    RETURN v_value;
END;
$$;
GRANT EXECUTE ON FUNCTION set_marketing_consent(BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Accepting an athlete invite turns marketing off for that account.
CREATE OR REPLACE FUNCTION athlete_no_marketing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.role = 'athlete' AND COALESCE(NEW.marketing_email_opt_in, true) THEN
        NEW.marketing_email_opt_in := false;
        NEW.marketing_email_updated_at := now();
        INSERT INTO marketing_consent_events (user_id, channel, opted_in, source)
        VALUES (NEW.id, 'email', false, 'athlete_account');
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_profiles_athlete_no_marketing ON user_profiles;
CREATE TRIGGER user_profiles_athlete_no_marketing
    BEFORE INSERT OR UPDATE OF role, marketing_email_opt_in ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION athlete_no_marketing();
