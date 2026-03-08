-- RALLY: Seed Data — AJV Travel 14u 2025-2026 Season
-- Source: PRD Section 5 + Appendix A/B
--
-- NOTE: This seed uses a placeholder user_id. After creating your first
-- Supabase Auth user, replace this UUID with your real auth.users.id.
-- You can also run this via a seed script that reads the current user.

DO $$
DECLARE
    v_user_id UUID := '00000000-0000-0000-0000-000000000001'; -- placeholder

    -- Tournament IDs (deterministic for FK references in bookings)
    t_fast_warmup       UUID := 'a0000000-0000-0000-0000-000000000001';
    t_tot_warmup        UUID := 'a0000000-0000-0000-0000-000000000002';
    t_tot_stop1         UUID := 'a0000000-0000-0000-0000-000000000003';
    t_tot_stop2         UUID := 'a0000000-0000-0000-0000-000000000004';
    t_atx_showcase      UUID := 'a0000000-0000-0000-0000-000000000005';
    t_northern_lights   UUID := 'a0000000-0000-0000-0000-000000000006';
    t_lone_star         UUID := 'a0000000-0000-0000-0000-000000000007';
    t_show_me           UUID := 'a0000000-0000-0000-0000-000000000008';
    t_lsr_regional      UUID := 'a0000000-0000-0000-0000-000000000009';
    t_fast_prejos       UUID := 'a0000000-0000-0000-0000-00000000000a';
    t_usav_nationals    UUID := 'a0000000-0000-0000-0000-00000000000b';
BEGIN

-- ============================================================
-- TEAM CONFIG
-- ============================================================

INSERT INTO team_config (user_id, team_name, season_year, team_code, club_email_domain, external_links)
VALUES (
    v_user_id,
    'AJV Travel 14u',
    '2025-2026',
    NULL,  -- team code entered by parent
    'ajvvolleyball.com',
    '[
        {"label": "LeagueApps", "url": "", "icon_name": "globe-outline"},
        {"label": "SportsEngine", "url": "", "icon_name": "globe-outline"},
        {"label": "GroupMe", "url": "", "icon_name": "chatbubbles-outline"},
        {"label": "SportsRecruits", "url": "", "icon_name": "school-outline"},
        {"label": "University Athlete", "url": "", "icon_name": "trophy-outline"},
        {"label": "USA Volleyball", "url": "https://usavolleyball.org", "icon_name": "shield-outline"},
        {"label": "Hudl", "url": "", "icon_name": "videocam-outline"},
        {"label": "TeamSnap", "url": "", "icon_name": "people-outline"}
    ]'::jsonb
);

-- ============================================================
-- TOURNAMENTS (11 events, PRD Section 5)
-- ============================================================

INSERT INTO tournaments (id, user_id, name, start_date, end_date, location_city, venues, travel_required, status) VALUES

-- 1. Fast Warm-Up
(t_fast_warmup, v_user_id, 'Fast Warm-Up',
 '2025-12-13', '2025-12-14', 'Houston, TX',
 '[{"address": "Houston, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 false, 'upcoming'),

-- 2. Tour of Texas Warm-Up
(t_tot_warmup, v_user_id, 'Tour of Texas Warm-Up',
 '2026-01-10', '2026-01-11', 'Austin/Round Rock, TX',
 '[{"address": "Austin/Round Rock, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 false, 'upcoming'),

-- 3. Tour of Texas Stop #1
(t_tot_stop1, v_user_id, 'Tour of Texas Stop #1',
 '2026-01-17', '2026-01-19', 'Round Rock, TX',
 '[{"address": "Round Rock, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 false, 'upcoming'),

-- 4. Tour of Texas Stop #2
(t_tot_stop2, v_user_id, 'Tour of Texas Stop #2',
 '2026-02-07', '2026-02-08', 'Dallas, TX',
 '[{"address": "Dallas, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 true, 'travel_needed'),

-- 5. ATX Showcase
(t_atx_showcase, v_user_id, 'ATX Showcase',
 '2026-02-14', '2026-02-15', 'Austin/Round Rock, TX',
 '[{"address": "Austin/Round Rock, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 false, 'upcoming'),

-- 6. Northern Lights
(t_northern_lights, v_user_id, 'Northern Lights',
 '2026-03-20', '2026-03-22', 'Minneapolis, MN',
 '[{"address": "Minneapolis, MN", "label": "TBD", "is_confirmed": false}]'::jsonb,
 true, 'booked'),

-- 7. Lone Star Classic
(t_lone_star, v_user_id, 'Lone Star Classic',
 '2026-04-03', '2026-04-05', 'Houston, TX',
 '[{"address": "Houston, TX", "label": "Marriott Marquis Houston", "is_confirmed": true}]'::jsonb,
 true, 'booked'),

-- 8. Show Me National Qualifier
(t_show_me, v_user_id, 'Show Me National Qualifier',
 '2026-04-17', '2026-04-19', 'Kansas City, MO',
 '[{"address": "Kansas City, MO", "label": "TBD", "is_confirmed": false}]'::jsonb,
 true, 'booked'),

-- 9. LSR Regional Championships
(t_lsr_regional, v_user_id, 'LSR Regional Championships',
 '2026-05-09', '2026-05-10', 'Houston, TX',
 '[{"address": "Houston, TX", "label": "Marriott Marquis Houston", "is_confirmed": true}]'::jsonb,
 true, 'booked'),

-- 10. Fast Pre-JOs
(t_fast_prejos, v_user_id, 'Fast Pre-JOs',
 '2026-06-20', '2026-06-21', 'Houston, TX',
 '[{"address": "Houston, TX", "label": "TBD", "is_confirmed": false}]'::jsonb,
 true, 'travel_needed'),

-- 11. USAV Nationals
(t_usav_nationals, v_user_id, 'USAV Nationals',
 '2026-06-25', '2026-06-28', 'Indianapolis, IN',
 '[{"address": "Indianapolis, IN", "label": "TBD", "is_confirmed": false}]'::jsonb,
 true, 'booked');

-- ============================================================
-- HOTEL BOOKINGS (PRD Appendix A/B)
-- ============================================================

INSERT INTO hotel_bookings (user_id, tournament_id, hotel_name, platform, booking_name, booked_by, reservation_number, check_in, check_out, cost, is_backup, status) VALUES

-- Tour of Texas Stop #2 — Dallas
(v_user_id, t_tot_stop2, 'Sheraton Dallas',
 'Other', 'TBD', 'TBD', '', '2026-02-06', '2026-02-08', 296.00, false, 'tentative'),

-- Northern Lights — Minneapolis
(v_user_id, t_northern_lights, 'Hilton / AC Hotel Minneapolis',
 'Bonvoy', 'Adam + Kenton', 'Adam', 'GNEZJ9', '2026-03-19', '2026-03-23', NULL, false, 'confirmed'),

-- Lone Star Classic — Houston (Stay-and-Play)
(v_user_id, t_lone_star, 'Marriott Marquis Houston',
 'Bonvoy', 'Sara + Kenton', 'Sara', '217759', '2026-04-03', '2026-04-05', NULL, false, 'confirmed'),

-- Show Me National Qualifier — Kansas City
(v_user_id, t_show_me, 'Hotel Indigo Kansas City',
 'Travel Source', 'Sara + Kenton', 'Sara', 'R-04869547', '2026-04-16', '2026-04-19', NULL, false, 'confirmed'),

-- LSR Regional Championships — Houston
(v_user_id, t_lsr_regional, 'Marriott Marquis Houston',
 'Direct', 'Adam + Kenton', 'Adam', '226560', '2026-05-08', '2026-05-10', 508.00, false, 'confirmed'),

-- USAV Nationals — Indianapolis
(v_user_id, t_usav_nationals, 'Courtyard Marriott Indianapolis',
 'Bonvoy', 'Sara', 'Sara', '', '2026-06-24', '2026-06-29', NULL, false, 'confirmed');

-- ============================================================
-- FLIGHT BOOKINGS (PRD Appendix A/B)
-- ============================================================

INSERT INTO flight_bookings (user_id, tournament_id, airline, confirmation_code, departure_date, return_date, booked_by, traveler_names, cost) VALUES

-- Northern Lights — Delta
(v_user_id, t_northern_lights, 'Delta',
 'GNEZJ9', '2026-03-19', '2026-03-23', 'Adam + Kenton',
 ARRAY['Adam', 'Kenton'], NULL),

-- Show Me NQ — Southwest (two confirmation codes: outbound/return)
(v_user_id, t_show_me, 'Southwest',
 'ATLALT / ATHAMF', '2026-04-16', '2026-04-19', 'Sara + Kenton',
 ARRAY['Sara', 'Kenton'], NULL),

-- USAV Nationals — Delta
(v_user_id, t_usav_nationals, 'Delta',
 'G5NLC8', '2026-06-24', '2026-06-29', 'Sara',
 ARRAY['Sara'], NULL);

END $$;
