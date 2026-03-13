-- ============================================================
-- RPC: setup_onboarding
-- Handles all onboarding inserts with SECURITY DEFINER to bypass RLS.
-- Called from the client after the user completes onboarding.
-- ============================================================

CREATE OR REPLACE FUNCTION setup_onboarding(
    p_athlete_name TEXT,
    p_team_name TEXT,
    p_club_name TEXT DEFAULT NULL,
    p_season_year TEXT DEFAULT '2025-2026',
    p_team_code TEXT DEFAULT NULL,
    p_streaming_url TEXT DEFAULT NULL,
    p_gmail_connected BOOLEAN DEFAULT false,
    p_gmail_email TEXT DEFAULT NULL,
    p_trusted_sender_emails TEXT[] DEFAULT '{}',
    p_tournaments JSONB DEFAULT '[]',
    p_additional_athletes JSONB DEFAULT '[]',
    p_guests JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_athlete_id UUID;
    v_season_id UUID;
    v_config_id UUID;
    v_extra JSONB;
    v_extra_athlete_id UUID;
    v_guest JSONB;
    v_tournament JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- 1. Ensure user_profiles row exists with role='admin'
    INSERT INTO user_profiles (id, role, display_name)
    VALUES (v_user_id, 'admin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'admin';

    -- 2. Clean up any previous onboarding data
    DELETE FROM admin_config WHERE user_id = v_user_id;

    -- Delete seasons, guests tied to this admin's athletes
    DELETE FROM seasons WHERE athlete_id IN (
        SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id
    );
    DELETE FROM guests WHERE athlete_id IN (
        SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id
    );
    DELETE FROM tournaments WHERE season_id IN (
        SELECT s.id FROM seasons s
        JOIN admin_athletes aa ON aa.athlete_id = s.athlete_id
        WHERE aa.admin_id = v_user_id
    );

    -- Delete athletes and links
    DELETE FROM athletes WHERE id IN (
        SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id
    );
    DELETE FROM admin_athletes WHERE admin_id = v_user_id;

    -- 3. Create primary athlete
    INSERT INTO athletes (first_name, last_name, can_edit)
    VALUES (COALESCE(NULLIF(p_athlete_name, ''), 'My Athlete'), NULL, false)
    RETURNING id INTO v_athlete_id;

    -- 4. Link admin to athlete
    INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
    VALUES (v_user_id, v_athlete_id, 'manage', true);

    -- 5. Create season
    INSERT INTO seasons (athlete_id, team_name, club_name, season_year, team_code,
                         schedule_import_source, schedule_import_connected, is_active)
    VALUES (v_athlete_id, p_team_name, NULLIF(p_club_name, ''), p_season_year,
            NULLIF(p_team_code, ''), NULL, false, true)
    RETURNING id INTO v_season_id;

    -- 6. Create admin_config
    INSERT INTO admin_config (user_id, active_season_id, trusted_sender_emails,
                              default_stream_url, gmail_connected, gmail_email)
    VALUES (v_user_id, v_season_id, p_trusted_sender_emails,
            NULLIF(p_streaming_url, ''), p_gmail_connected, NULLIF(p_gmail_email, ''))
    RETURNING id INTO v_config_id;

    -- 7. Insert tournaments
    FOR v_tournament IN SELECT * FROM jsonb_array_elements(p_tournaments)
    LOOP
        INSERT INTO tournaments (season_id, name, start_date, end_date, location_city, venues, status, travel_required)
        VALUES (
            v_season_id,
            v_tournament->>'name',
            v_tournament->>'start_date',
            v_tournament->>'end_date',
            v_tournament->>'location_city',
            COALESCE(v_tournament->'venues', '[]'::jsonb),
            'upcoming',
            true
        );
    END LOOP;

    -- 8. Additional athletes
    FOR v_extra IN SELECT * FROM jsonb_array_elements(p_additional_athletes)
    LOOP
        IF COALESCE(NULLIF(v_extra->>'firstName', ''), NULL) IS NOT NULL THEN
            INSERT INTO athletes (first_name, last_name, can_edit)
            VALUES (v_extra->>'firstName', NULL, false)
            RETURNING id INTO v_extra_athlete_id;

            INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
            VALUES (v_user_id, v_extra_athlete_id, 'manage', true);
        END IF;
    END LOOP;

    -- 9. Guests
    FOR v_guest IN SELECT * FROM jsonb_array_elements(p_guests)
    LOOP
        IF COALESCE(NULLIF(v_guest->>'name', ''), NULL) IS NOT NULL THEN
            INSERT INTO guests (athlete_id, name, relationship, phone, notify_sms)
            VALUES (
                v_athlete_id,
                v_guest->>'name',
                COALESCE(v_guest->>'relationship', 'Family'),
                NULLIF(v_guest->>'phone', ''),
                COALESCE(NULLIF(v_guest->>'phone', ''), NULL) IS NOT NULL
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'athlete_id', v_athlete_id,
        'season_id', v_season_id,
        'config_id', v_config_id
    );
END;
$$;
