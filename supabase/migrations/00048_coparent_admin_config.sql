-- Fix: co-parents need their own admin_config row for full functionality
-- (email forwarding, settings, seasons, etc.)

-- 1. Update accept_athlete_invite to create admin_config for co-parents
CREATE OR REPLACE FUNCTION accept_athlete_invite(code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite athlete_invites%ROWTYPE;
    v_sibling athlete_invites%ROWTYPE;
    v_season_id UUID;
BEGIN
    -- Find the invite
    SELECT * INTO v_invite
    FROM athlete_invites
    WHERE invite_code = code
      AND status = 'pending'
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    -- Prevent self-invite
    IF v_invite.inviter_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Cannot accept your own invite');
    END IF;

    IF v_invite.invite_type = 'admin' THEN
        -- Create user_profiles if not exists
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'admin')
        ON CONFLICT (id) DO UPDATE SET role = 'admin';

        -- Link this athlete
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
        VALUES (auth.uid(), v_invite.athlete_id, v_invite.permission, false)
        ON CONFLICT (admin_id, athlete_id) DO NOTHING;

        -- Mark this invite accepted
        UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;

        -- Auto-accept all other pending invites from the same inviter to the same email
        FOR v_sibling IN
            SELECT * FROM athlete_invites
            WHERE inviter_id = v_invite.inviter_id
              AND email = v_invite.email
              AND invite_type = v_invite.invite_type
              AND status = 'pending'
              AND expires_at > now()
              AND id != v_invite.id
        LOOP
            INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
            VALUES (auth.uid(), v_sibling.athlete_id, v_sibling.permission, false)
            ON CONFLICT (admin_id, athlete_id) DO NOTHING;

            UPDATE athlete_invites SET status = 'accepted' WHERE id = v_sibling.id;
        END LOOP;

        -- Create admin_config if co-parent doesn't have one yet
        IF NOT EXISTS (SELECT 1 FROM admin_config WHERE user_id = auth.uid()) THEN
            -- Find the active season for the shared athlete
            SELECT s.id INTO v_season_id
            FROM seasons s
            WHERE s.athlete_id = v_invite.athlete_id
              AND s.is_active = true
            LIMIT 1;

            INSERT INTO admin_config (
                id, user_id, rally_forward_address, ical_feed_token,
                active_season_id, gmail_connected, trusted_sender_emails, external_links
            ) VALUES (
                gen_random_uuid(), auth.uid(),
                'plans@rally-hub.com',
                encode(extensions.gen_random_bytes(16), 'hex'),
                v_season_id,
                false,
                '{}',
                '[
                  {"label":"GroupMe","icon_name":"chatbubbles-outline","url":"","username":null,"password":null},
                  {"label":"LeagueApps","icon_name":"trophy-outline","url":"","username":null,"password":null},
                  {"label":"TeamSnap","icon_name":"people-outline","url":"","username":null,"password":null},
                  {"label":"SportsRecruits","icon_name":"school-outline","url":"","username":null,"password":null,"scope":"athlete"},
                  {"label":"University Athlete","icon_name":"trophy-outline","url":"","username":null,"password":null,"scope":"athlete"}
                ]'::jsonb
            );
        END IF;

    ELSIF v_invite.invite_type = 'athlete' THEN
        -- Set user_profiles to athlete role
        INSERT INTO user_profiles (id, role) VALUES (auth.uid(), 'athlete')
        ON CONFLICT (id) DO UPDATE SET role = 'athlete';

        -- Link auth account to athletes.user_id
        UPDATE athletes SET user_id = auth.uid()
        WHERE id = v_invite.athlete_id AND user_id IS NULL;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Athlete already linked to another account');
        END IF;

        -- Mark invite accepted
        UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Invite accepted successfully');
END;
$$;

-- 2. Backfill: create admin_config for existing co-parents who don't have one
INSERT INTO admin_config (id, user_id, rally_forward_address, ical_feed_token, active_season_id, gmail_connected, trusted_sender_emails, external_links)
SELECT
    gen_random_uuid(),
    aa.admin_id,
    'plans@rally-hub.com',
    encode(extensions.gen_random_bytes(16), 'hex'),
    (SELECT s.id FROM seasons s WHERE s.athlete_id = aa.athlete_id AND s.is_active = true LIMIT 1),
    false,
    '{}',
    '[
      {"label":"GroupMe","icon_name":"chatbubbles-outline","url":"","username":null,"password":null},
      {"label":"LeagueApps","icon_name":"trophy-outline","url":"","username":null,"password":null},
      {"label":"TeamSnap","icon_name":"people-outline","url":"","username":null,"password":null},
      {"label":"SportsRecruits","icon_name":"school-outline","url":"","username":null,"password":null,"scope":"athlete"},
      {"label":"University Athlete","icon_name":"trophy-outline","url":"","username":null,"password":null,"scope":"athlete"}
    ]'::jsonb
FROM admin_athletes aa
JOIN user_profiles up ON up.id = aa.admin_id AND up.role = 'admin'
WHERE aa.is_primary = false
  AND NOT EXISTS (SELECT 1 FROM admin_config ac WHERE ac.user_id = aa.admin_id)
GROUP BY aa.admin_id, aa.athlete_id;
