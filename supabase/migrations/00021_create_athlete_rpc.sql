-- RPC to create athlete + admin_athletes link + first season atomically
-- Avoids RLS chicken-and-egg: insert requires select, select requires link, link requires insert
CREATE OR REPLACE FUNCTION create_athlete_with_season(
    p_first_name TEXT,
    p_last_name TEXT DEFAULT NULL,
    p_team_name TEXT DEFAULT '',
    p_club_name TEXT DEFAULT NULL,
    p_season_year TEXT DEFAULT '2025-2026'
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
BEGIN
    -- Create athlete
    INSERT INTO athletes (id, first_name, last_name, can_edit)
    VALUES (gen_random_uuid(), p_first_name, p_last_name, false)
    RETURNING id INTO v_athlete_id;

    -- Link admin to athlete
    INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
    VALUES (v_user_id, v_athlete_id, 'manage', true);

    -- Create first season
    INSERT INTO seasons (id, athlete_id, team_name, club_name, season_year, sport, is_active)
    VALUES (gen_random_uuid(), v_athlete_id, p_team_name, p_club_name, p_season_year, 'volleyball', true)
    RETURNING id INTO v_season_id;

    RETURN jsonb_build_object(
        'athlete_id', v_athlete_id,
        'season_id', v_season_id,
        'success', true
    );
END;
$$;
