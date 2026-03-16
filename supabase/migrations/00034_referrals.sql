-- Referral tracking table
CREATE TABLE referrals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_email    TEXT,
    referred_phone    TEXT,
    status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed_up','active')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    converted_at      TIMESTAMPTZ,
    CONSTRAINT referrals_has_contact CHECK (referred_email IS NOT NULL OR referred_phone IS NOT NULL)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_email ON referrals(referred_email) WHERE referred_email IS NOT NULL;

-- RLS: users can insert their own referrals, read their own
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own referrals"
    ON referrals FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = referrer_user_id);

CREATE POLICY "Users can read own referrals"
    ON referrals FOR SELECT TO authenticated
    USING (auth.uid() = referrer_user_id);

-- Admin RPC: list all referrals
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

REVOKE ALL ON FUNCTION admin_list_referrals(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_referrals(INT, INT) TO authenticated;
