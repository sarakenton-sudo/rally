-- RPC: store Google OAuth tokens from sign-in into gmail_tokens
-- Called after Google sign-in to enable Gmail sync without a second OAuth flow

CREATE OR REPLACE FUNCTION store_google_auth_tokens(
    p_access_token TEXT,
    p_refresh_token TEXT,
    p_expires_in INTEGER DEFAULT 3600,
    p_gmail_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF p_access_token IS NULL OR p_access_token = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'No access token provided');
    END IF;

    v_email := COALESCE(p_gmail_email, (
        SELECT email FROM auth.users WHERE id = v_user_id
    ));
    v_expires_at := now() + (p_expires_in * interval '1 second');

    -- Upsert gmail_tokens
    INSERT INTO gmail_tokens (user_id, access_token, refresh_token, token_expires_at, gmail_email, is_active, sync_errors)
    VALUES (v_user_id, p_access_token, COALESCE(p_refresh_token, ''), v_expires_at, v_email, true, 0)
    ON CONFLICT (user_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = CASE
            WHEN EXCLUDED.refresh_token != '' THEN EXCLUDED.refresh_token
            ELSE gmail_tokens.refresh_token  -- keep existing refresh token if new one is empty
        END,
        token_expires_at = EXCLUDED.token_expires_at,
        gmail_email = EXCLUDED.gmail_email,
        is_active = true,
        sync_errors = 0;

    -- Update admin_config if it exists
    UPDATE admin_config
    SET gmail_connected = true, gmail_email = v_email
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$$;
