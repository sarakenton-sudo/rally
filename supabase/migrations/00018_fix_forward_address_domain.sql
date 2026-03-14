-- Update default forward address domain to rally-hub.com
ALTER TABLE admin_config ALTER COLUMN rally_forward_address SET DEFAULT 'plans@rally-hub.com';

-- Update any existing records still using old domains
UPDATE admin_config
SET rally_forward_address = REPLACE(
    REPLACE(rally_forward_address, '@plans.rally.app', '@plans.rally-hub.com'),
    '@rallyhub.com', '@rally-hub.com'
)
WHERE rally_forward_address LIKE '%@plans.rally.app'
   OR rally_forward_address LIKE '%@rallyhub.com';

-- Re-create setup_onboarding with corrected forward address domain
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
    v_tournament_id UUID;
    v_guests_arr JSONB;
    v_tournaments_arr JSONB;
    v_name_parts TEXT[];
    v_first_name TEXT;
    v_last_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Idempotent: clean up prior attempts
    DELETE FROM tournament_guests WHERE tournament_id IN (
        SELECT t.id FROM tournaments t
        JOIN seasons s ON t.season_id = s.id
        WHERE s.athlete_id IN (SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id)
    );
    DELETE FROM tournaments WHERE season_id IN (
        SELECT s.id FROM seasons s
        WHERE s.athlete_id IN (SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id)
    );
    DELETE FROM guests WHERE user_id = v_user_id;
    DELETE FROM seasons WHERE athlete_id IN (SELECT athlete_id FROM admin_athletes WHERE admin_id = v_user_id);
    DELETE FROM admin_athletes WHERE admin_id = v_user_id;
    DELETE FROM athletes WHERE id IN (
        SELECT id FROM athletes WHERE id NOT IN (SELECT athlete_id FROM admin_athletes)
        AND id NOT IN (SELECT athlete_id FROM seasons)
    );
    DELETE FROM admin_config WHERE user_id = v_user_id;
    DELETE FROM user_profiles WHERE id = v_user_id;

    -- 1. User profile
    INSERT INTO user_profiles (id, role, display_name)
    VALUES (v_user_id, 'admin', NULL)
    ON CONFLICT (id) DO NOTHING;

    -- 2. Athlete
    v_name_parts := string_to_array(p_athlete_name, ' ');
    v_first_name := v_name_parts[1];
    v_last_name := CASE WHEN array_length(v_name_parts, 1) > 1 THEN array_to_string(v_name_parts[2:], ' ') ELSE NULL END;

    INSERT INTO athletes (id, first_name, last_name, can_edit)
    VALUES (gen_random_uuid(), v_first_name, v_last_name, false)
    RETURNING id INTO v_athlete_id;

    -- 3. Admin-athlete link
    INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
    VALUES (v_user_id, v_athlete_id, 'manage', true);

    -- 4. Season
    INSERT INTO seasons (id, athlete_id, team_name, club_name, season_year, sport, team_code, is_active)
    VALUES (gen_random_uuid(), v_athlete_id, p_team_name, p_club_name, p_season_year, 'volleyball', p_team_code, true)
    RETURNING id INTO v_season_id;

    -- 5. Admin config
    INSERT INTO admin_config (id, user_id, rally_forward_address, ical_feed_token, active_season_id, gmail_connected, gmail_email, trusted_sender_emails, external_links)
    VALUES (
        gen_random_uuid(), v_user_id,
        v_user_id || '@plans.rally-hub.com',
        encode(gen_random_bytes(16), 'hex'),
        v_season_id,
        p_gmail_connected, p_gmail_email,
        p_trusted_sender_emails,
        '[
            {"label":"GroupMe","url":"","icon_name":"chatbubbles-outline","username":null,"password":null},
            {"label":"LeagueApps","url":"","icon_name":"trophy-outline","username":null,"password":null},
            {"label":"TeamSnap","url":"","icon_name":"people-outline","username":null,"password":null},
            {"label":"SportsRecruits","url":"","icon_name":"school-outline","username":null,"password":null,"scope":"athlete"},
            {"label":"University Athlete","url":"","icon_name":"trophy-outline","username":null,"password":null,"scope":"athlete"}
        ]'::jsonb
    );

    -- 6. Tournaments
    v_tournaments_arr := COALESCE(p_tournaments, '[]'::jsonb);
    IF jsonb_array_length(v_tournaments_arr) > 0 THEN
        FOR v_tournament IN SELECT * FROM jsonb_array_elements(v_tournaments_arr)
        LOOP
            BEGIN
                v_start_date := (v_tournament->>'start_date')::DATE;
                v_end_date := (v_tournament->>'end_date')::DATE;
            EXCEPTION WHEN OTHERS THEN
                v_start_date := CURRENT_DATE;
                v_end_date := CURRENT_DATE;
            END;

            INSERT INTO tournaments (id, season_id, name, start_date, end_date, location_city, travel_required, status, venues, streaming_links)
            VALUES (
                gen_random_uuid(), v_season_id,
                v_tournament->>'name',
                v_start_date,
                v_end_date,
                COALESCE(v_tournament->>'location_city', ''),
                COALESCE((v_tournament->>'travel_required')::boolean, true),
                'upcoming',
                '[]'::jsonb,
                '[]'::jsonb
            )
            RETURNING id INTO v_tournament_id;
        END LOOP;
    END IF;

    -- 7. Additional athletes
    IF jsonb_array_length(COALESCE(p_additional_athletes, '[]'::jsonb)) > 0 THEN
        FOR v_extra IN SELECT * FROM jsonb_array_elements(p_additional_athletes)
        LOOP
            v_name_parts := string_to_array(COALESCE(v_extra->>'name', 'Athlete'), ' ');

            INSERT INTO athletes (id, first_name, last_name, can_edit)
            VALUES (gen_random_uuid(), v_name_parts[1],
                CASE WHEN array_length(v_name_parts, 1) > 1 THEN array_to_string(v_name_parts[2:], ' ') ELSE NULL END,
                false)
            RETURNING id INTO v_extra_athlete_id;

            INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
            VALUES (v_user_id, v_extra_athlete_id, 'manage', true);
        END LOOP;
    END IF;

    -- 8. Guests (user_id scoped, not athlete_id)
    v_guests_arr := COALESCE(p_guests, '[]'::jsonb);
    IF jsonb_array_length(v_guests_arr) > 0 THEN
        FOR v_guest IN SELECT * FROM jsonb_array_elements(v_guests_arr)
        LOOP
            IF COALESCE(NULLIF(v_guest->>'name', ''), NULL) IS NOT NULL THEN
                INSERT INTO guests (user_id, name, relationship, phone, notification_pref, default_invited)
                VALUES (
                    v_user_id,
                    v_guest->>'name',
                    COALESCE(v_guest->>'relationship', 'Family'),
                    NULLIF(v_guest->>'phone', ''),
                    'sms',
                    true
                );
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'athlete_id', v_athlete_id,
        'season_id', v_season_id,
        'success', true
    );
END;
$$;
