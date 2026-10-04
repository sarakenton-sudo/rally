-- ============================================================
-- Profile photos for everyone: parents (user_profiles.avatar_url) and
-- athletes (athletes.photo_url). Coaches already have coaches.photo_url.
-- Files go in the existing public 'coach-photos' bucket under the uploader's
-- own uid folder (00059 policy), so no storage changes are needed.
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE athletes      ADD COLUMN IF NOT EXISTS photo_url  TEXT;

CREATE OR REPLACE FUNCTION set_my_avatar(p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE user_profiles SET avatar_url = NULLIF(trim(p_url), '') WHERE id = auth.uid(); $$;
GRANT EXECUTE ON FUNCTION set_my_avatar(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION set_athlete_photo(p_athlete_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete is not accessible to this user';
    END IF;
    UPDATE athletes SET photo_url = NULLIF(trim(p_url), '') WHERE id = p_athlete_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_athlete_photo(UUID, TEXT) TO authenticated;

-- Coaches see athlete photos in Clients.
CREATE OR REPLACE FUNCTION coach_client_athletes(p_coach_id UUID, p_parent UUID, p_athlete UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'photo_url', a.photo_url,
        'grad_year', a.grad_year,
        'positions', a.positions,
        'level', a.level,
        'club_team', a.club_team,
        'height_inches', a.height_inches,
        'goals', a.goals
    ) ORDER BY a.first_name), '[]'::jsonb)
    FROM athletes a
    WHERE a.id = p_athlete
       OR a.id IN (SELECT athlete_id FROM booking_requests
                    WHERE coach_id = p_coach_id AND parent_user_id = p_parent);
$$;
