-- ============================================================
-- Parents can remove an athlete's own RallyHUB login (Family → athlete →
-- Athlete login → Remove login). The athlete, their schedule and everything
-- else stay; only the login is unlinked. If that login was only ever this
-- athlete's (not a parent, coach or fan account too), the account is deleted.
-- Also cancels pending athlete invites for that athlete.
-- ============================================================
CREATE OR REPLACE FUNCTION remove_athlete_login(p_athlete_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_uid UUID; v_deleted BOOLEAN := false;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = auth.uid() AND athlete_id = p_athlete_id AND permission = 'manage') THEN
        RAISE EXCEPTION 'Only a parent who manages this athlete can remove their login.';
    END IF;

    SELECT user_id INTO v_uid FROM athletes WHERE id = p_athlete_id;
    UPDATE athletes SET user_id = NULL WHERE id = p_athlete_id;
    DELETE FROM athlete_invites WHERE athlete_id = p_athlete_id AND invite_type = 'athlete' AND status = 'pending';

    -- Delete the account only if it was just this athlete's login.
    IF v_uid IS NOT NULL AND v_uid <> auth.uid()
       AND NOT EXISTS (SELECT 1 FROM athletes WHERE user_id = v_uid)
       AND NOT EXISTS (SELECT 1 FROM admin_athletes WHERE admin_id = v_uid)
       AND NOT EXISTS (SELECT 1 FROM coaches WHERE user_id = v_uid)
       AND NOT EXISTS (SELECT 1 FROM fans WHERE fan_user_id = v_uid) THEN
        BEGIN
            DELETE FROM auth.users WHERE id = v_uid;
            v_deleted := true;
        EXCEPTION WHEN OTHERS THEN
            v_deleted := false;  -- still unlinked; the empty account just stays
        END;
    END IF;
    RETURN jsonb_build_object('unlinked', v_uid IS NOT NULL, 'account_deleted', v_deleted);
END;
$$;
REVOKE ALL ON FUNCTION remove_athlete_login(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_athlete_login(UUID) TO authenticated;
