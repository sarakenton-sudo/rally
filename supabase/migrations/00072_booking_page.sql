-- ============================================================
-- Coach Experience — Phase B: public booking page + embed
--
--  * coaches.booking_page_published: the page at rally-hub.com/book/<slug>
--    only resolves once the coach publishes it (and has accepted the Coach
--    Platform Agreement). visibility 'public' vs 'private' stays about
--    directory listing; both can share their link.
--  * get_booking_page(slug): everything the logged-out page shows — never
--    stripe ids, contact info, or full addresses (city only until booked).
--  * connect_via_booking_page(slug): a signed-in visitor becomes the coach's
--    client so the normal request flow (RLS on slots) works.
--  * create_lesson_athlete(): lessons-first parents add an athlete without
--    the team/season onboarding.
-- ============================================================

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS booking_page_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS headline TEXT;          -- one-liner under the name
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS accent_color TEXT;      -- page/embed accent, e.g. '#3B82B0'

-- Coach edits their booking-page settings (slug must stay unique + URL-safe).
CREATE OR REPLACE FUNCTION set_my_booking_page(p_published BOOLEAN, p_slug TEXT, p_headline TEXT, p_accent TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slug TEXT := lower(regexp_replace(trim(COALESCE(p_slug, '')), '[^a-zA-Z0-9-]+', '-', 'g'));
    v_coach coaches%ROWTYPE;
BEGIN
    SELECT * INTO v_coach FROM coaches WHERE id = my_coach_id() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not a coach'; END IF;
    v_slug := trim(both '-' from v_slug);
    IF length(v_slug) < 3 THEN RAISE EXCEPTION 'Page address must be at least 3 letters or numbers'; END IF;
    IF EXISTS (SELECT 1 FROM coaches WHERE slug = v_slug AND id <> v_coach.id) THEN
        RAISE EXCEPTION 'That page address is taken — try another';
    END IF;
    IF p_published AND v_coach.platform_agreement_accepted_at IS NULL THEN
        RAISE EXCEPTION 'Accept the Coach Platform Agreement (Terms & Release) before publishing';
    END IF;
    UPDATE coaches
       SET booking_page_published = p_published,
           slug = v_slug,
           headline = NULLIF(trim(p_headline), ''),
           accent_color = CASE WHEN p_accent ~ '^#[0-9a-fA-F]{6}$' THEN p_accent ELSE accent_color END
     WHERE id = v_coach.id;
    RETURN jsonb_build_object('slug', v_slug, 'published', p_published);
END;
$$;
GRANT EXECUTE ON FUNCTION set_my_booking_page(BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- get_booking_page — public, anon-safe payload for /book/<slug>
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_booking_page(p_slug TEXT, p_days INT DEFAULT 60)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'coach', jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'display_name', c.display_name,
            'headline', c.headline,
            'photo_url', c.photo_url,
            'bio', c.bio,
            'specialties', c.specialties,
            'sport', c.sport,
            'primary_city', c.primary_city,
            'certifications', c.certifications,
            'safesport_status', c.safesport_status,
            'identity_verified', c.identity_verified,
            'accepts_payments', c.stripe_charges_enabled,
            'accent_color', c.accent_color,
            'fee_handling', c.fee_handling,
            'payment_timing', c.payment_timing
        ),
        'session_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', st.id, 'name', st.name, 'kind', st.kind, 'description', st.description,
                'price_cents', st.price_cents, 'duration_min', st.duration_min, 'capacity', st.capacity
            ) ORDER BY st.price_cents)
            FROM session_types st WHERE st.coach_id = c.id AND st.is_active
        ), '[]'::jsonb),
        'facilities', COALESCE((
            SELECT jsonb_agg(DISTINCT jsonb_build_object('id', f.id, 'label', f.label, 'city', f.city))
            FROM facilities f WHERE f.coach_id = c.id AND f.is_active
        ), '[]'::jsonb),
        'slots', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id,
                'starts_at', s.starts_at,
                'ends_at', s.ends_at,
                'seats_left', s.seats_total - s.seats_taken,
                'seats_total', s.seats_total,
                'eligible_session_type_ids', s.eligible_session_type_ids,
                'facility_id', s.facility_id
            ) ORDER BY s.starts_at)
            FROM slots s
            WHERE s.coach_id = c.id
              AND s.status = 'open'
              AND s.visibility = 'all'            -- client/group-only times stay private
              AND s.seats_taken < s.seats_total
              AND s.starts_at > now()
              AND s.starts_at < now() + make_interval(days => LEAST(GREATEST(p_days, 1), 120))
        ), '[]'::jsonb)
    )
    FROM coaches c
    WHERE c.slug = lower(p_slug)
      AND c.booking_page_published
      AND c.platform_agreement_accepted_at IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION get_booking_page(TEXT, INT) TO anon, authenticated;

-- ------------------------------------------------------------
-- connect_via_booking_page — visitor (signed in) becomes the coach's client
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION connect_via_booking_page(p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    SELECT id INTO v_coach_id FROM coaches
     WHERE slug = lower(p_slug) AND booking_page_published AND platform_agreement_accepted_at IS NOT NULL;
    IF v_coach_id IS NULL THEN RAISE EXCEPTION 'booking page not found'; END IF;
    INSERT INTO coach_connections (coach_id, parent_user_id, status)
    VALUES (v_coach_id, auth.uid(), 'active')
    ON CONFLICT (coach_id, parent_user_id) DO UPDATE SET status = 'active';
    RETURN v_coach_id;
END;
$$;
GRANT EXECUTE ON FUNCTION connect_via_booking_page(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- create_lesson_athlete — add an athlete without a team/season
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_lesson_athlete(
    p_first_name TEXT,
    p_last_name  TEXT DEFAULT NULL,
    p_grad_year  INT DEFAULT NULL,
    p_positions  TEXT[] DEFAULT '{}',
    p_club_team  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF NULLIF(trim(p_first_name), '') IS NULL THEN RAISE EXCEPTION 'first name required'; END IF;
    INSERT INTO athletes (first_name, last_name, grad_year, positions, club_team, can_edit)
    VALUES (trim(p_first_name), NULLIF(trim(p_last_name), ''), p_grad_year, COALESCE(p_positions, '{}'), NULLIF(trim(p_club_team), ''), false)
    RETURNING id INTO v_id;
    INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
    VALUES (auth.uid(), v_id, 'manage', true);
    RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_lesson_athlete(TEXT, TEXT, INT, TEXT[], TEXT) TO authenticated;
