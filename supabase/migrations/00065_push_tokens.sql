-- ============================================================
-- Push tokens
--
-- NotificationProvider used to upsert into app_sessions.push_token, a column
-- that never existed — every save failed silently, so no device was ever
-- registered. This is the real home: one row per device token, owned by the
-- user currently signed in on that device.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
    token      TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform   TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own push tokens" ON push_tokens;
CREATE POLICY "Users read own push tokens"
    ON push_tokens FOR SELECT
    USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own push tokens" ON push_tokens;
CREATE POLICY "Users delete own push tokens"
    ON push_tokens FOR DELETE
    USING (user_id = auth.uid());

-- Writes go through this RPC so a shared device that switches accounts moves
-- the token to the new user (a plain upsert would be blocked by RLS on the old
-- owner's row).
CREATE OR REPLACE FUNCTION register_push_token(p_token TEXT, p_platform TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;
    INSERT INTO push_tokens (token, user_id, platform, updated_at)
    VALUES (p_token, auth.uid(), p_platform, now())
    ON CONFLICT (token) DO UPDATE
        SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION register_push_token(TEXT, TEXT) TO authenticated;
