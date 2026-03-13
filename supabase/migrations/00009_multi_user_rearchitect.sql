-- RALLY: Multi-User Re-Architecture Migration
-- Admin → Athlete → Season model
-- Replaces household co-parent model with 3-tier system

-- ============================================================
-- NEW ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'athlete');
CREATE TYPE admin_permission AS ENUM ('manage', 'view');
CREATE TYPE invite_type AS ENUM ('admin', 'athlete');

-- ============================================================
-- NEW TABLES
-- ============================================================

-- User profiles (1:1 with auth.users, role tracking)
CREATE TABLE user_profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role         user_role NOT NULL DEFAULT 'admin',
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Athletes (represents a kid)
CREATE TABLE athletes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name  TEXT,
    can_edit   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-Athlete junction (replaces household_members)
CREATE TABLE admin_athletes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id  UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    permission  admin_permission NOT NULL DEFAULT 'manage',
    is_primary  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (admin_id, athlete_id)
);

-- Seasons (split from team_config season-specific fields)
CREATE TABLE seasons (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id                UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    team_name                 TEXT NOT NULL,
    club_name                 TEXT,
    season_year               TEXT NOT NULL,
    sport                     TEXT NOT NULL DEFAULT 'volleyball',
    team_code                 TEXT,
    schedule_import_source    TEXT,
    schedule_import_connected BOOLEAN NOT NULL DEFAULT false,
    is_active                 BOOLEAN NOT NULL DEFAULT true,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Athlete invites (replaces household_invites)
CREATE TABLE athlete_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id  UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    invite_type invite_type NOT NULL DEFAULT 'admin',
    permission  admin_permission NOT NULL DEFAULT 'view',
    invite_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    status      invite_status NOT NULL DEFAULT 'pending',
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (invite_code)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_admin_athletes_admin ON admin_athletes(admin_id);
CREATE INDEX idx_admin_athletes_athlete ON admin_athletes(athlete_id);
CREATE INDEX idx_seasons_athlete ON seasons(athlete_id);
CREATE INDEX idx_athlete_invites_code ON athlete_invites(invite_code);
CREATE INDEX idx_athlete_invites_inviter ON athlete_invites(inviter_id);

-- ============================================================
-- MODIFY EXISTING TABLES
-- ============================================================

-- tournaments: add season_id (nullable initially for migration)
ALTER TABLE tournaments ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE CASCADE;

-- hotel_bookings: rename user_id → created_by_user_id
ALTER TABLE hotel_bookings RENAME COLUMN user_id TO created_by_user_id;

-- flight_bookings: rename user_id → created_by_user_id
ALTER TABLE flight_bookings RENAME COLUMN user_id TO created_by_user_id;

-- guests: add athlete_id (nullable initially for migration)
ALTER TABLE guests ADD COLUMN athlete_id UUID REFERENCES athletes(id) ON DELETE CASCADE;

-- usav_profiles: add athlete_id (nullable initially for migration)
ALTER TABLE usav_profiles ADD COLUMN athlete_id UUID REFERENCES athletes(id) ON DELETE CASCADE;

-- team_events: add season_id (nullable initially for migration)
ALTER TABLE team_events ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE CASCADE;

-- team_config: add active_season_id (will become admin_config)
ALTER TABLE team_config ADD COLUMN active_season_id UUID REFERENCES seasons(id) ON DELETE SET NULL;

-- ============================================================
-- DATA MIGRATION
-- ============================================================

DO $$
DECLARE
    tc RECORD;
    v_athlete_id UUID;
    v_season_id UUID;
    hm RECORD;
BEGIN
    -- Migrate each team_config row
    FOR tc IN SELECT * FROM team_config LOOP
        -- 1. Create user_profiles row (role='admin')
        INSERT INTO user_profiles (id, role, display_name)
        VALUES (tc.user_id, 'admin', NULL)
        ON CONFLICT (id) DO NOTHING;

        -- 2. Create athletes row
        v_athlete_id := gen_random_uuid();
        INSERT INTO athletes (id, user_id, first_name, last_name, can_edit)
        VALUES (
            v_athlete_id,
            NULL,  -- athlete doesn't have own login yet
            COALESCE(NULLIF(tc.athlete_name, ''), 'My Athlete'),
            NULL,
            false
        );

        -- 3. Create admin_athletes row
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
        VALUES (tc.user_id, v_athlete_id, 'manage', true);

        -- 4. Create seasons row from team_config season fields
        v_season_id := gen_random_uuid();
        INSERT INTO seasons (id, athlete_id, team_name, club_name, season_year, team_code, schedule_import_source, schedule_import_connected, is_active)
        VALUES (
            v_season_id,
            v_athlete_id,
            tc.team_name,
            tc.club_name,
            tc.season_year,
            tc.team_code,
            tc.schedule_import_source,
            tc.schedule_import_connected,
            true
        );

        -- 5. Update tournaments SET season_id where user_id matches
        UPDATE tournaments
        SET season_id = v_season_id
        WHERE user_id = tc.user_id
          AND season_id IS NULL;

        -- 6. Update guests SET athlete_id where user_id matches
        UPDATE guests
        SET athlete_id = v_athlete_id
        WHERE user_id = tc.user_id
          AND athlete_id IS NULL;

        -- 7. Update usav_profiles SET athlete_id where user_id matches
        UPDATE usav_profiles
        SET athlete_id = v_athlete_id
        WHERE user_id = tc.user_id
          AND athlete_id IS NULL;

        -- 8. Update team_events SET season_id where user_id matches
        UPDATE team_events
        SET season_id = v_season_id
        WHERE user_id = tc.user_id
          AND season_id IS NULL;

        -- 9. Set active_season_id on team_config
        UPDATE team_config
        SET active_season_id = v_season_id
        WHERE id = tc.id;
    END LOOP;

    -- Migrate household_members → admin_athletes
    -- Co-parents become additional admins with 'view' permission
    FOR hm IN
        SELECT hm.*, aa.athlete_id
        FROM household_members hm
        JOIN admin_athletes aa ON aa.admin_id = hm.owner_user_id AND aa.is_primary = true
    LOOP
        -- Create user_profiles for co-parent if not exists
        INSERT INTO user_profiles (id, role, display_name)
        VALUES (hm.member_user_id, 'admin', NULL)
        ON CONFLICT (id) DO NOTHING;

        -- Link co-parent to the same athlete
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
        VALUES (hm.member_user_id, hm.athlete_id, 'view', false)
        ON CONFLICT (admin_id, athlete_id) DO NOTHING;
    END LOOP;
END $$;

-- ============================================================
-- NOW ENFORCE NOT NULL (after data migration)
-- ============================================================

-- tournaments.season_id: make NOT NULL
ALTER TABLE tournaments ALTER COLUMN season_id SET NOT NULL;
CREATE INDEX idx_tournaments_season ON tournaments(season_id);

-- Remove user_id from tournaments (data now accessed via season)
ALTER TABLE tournaments DROP COLUMN user_id;

-- guests: make athlete_id NOT NULL, drop user_id
ALTER TABLE guests ALTER COLUMN athlete_id SET NOT NULL;
ALTER TABLE guests DROP COLUMN user_id;

-- usav_profiles: make athlete_id NOT NULL, drop user_id
ALTER TABLE usav_profiles ALTER COLUMN athlete_id SET NOT NULL;
ALTER TABLE usav_profiles DROP COLUMN user_id;

-- team_events: make season_id NOT NULL, drop user_id
ALTER TABLE team_events ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE team_events DROP COLUMN user_id;

-- team_config: drop season-specific fields (now in seasons table)
ALTER TABLE team_config DROP COLUMN team_name;
ALTER TABLE team_config DROP COLUMN club_name;
ALTER TABLE team_config DROP COLUMN season_year;
ALTER TABLE team_config DROP COLUMN team_code;
ALTER TABLE team_config DROP COLUMN athlete_name;
ALTER TABLE team_config DROP COLUMN schedule_import_source;
ALTER TABLE team_config DROP COLUMN schedule_import_connected;

-- Drop the unique constraint that referenced season_year
ALTER TABLE team_config DROP CONSTRAINT IF EXISTS team_config_user_id_season_year_key;

-- Rename team_config → admin_config
ALTER TABLE team_config RENAME TO admin_config;

-- ============================================================
-- DROP OLD HOUSEHOLD TABLES & FUNCTIONS
-- ============================================================

-- Drop RLS policies on household tables first
DROP POLICY IF EXISTS "Users read own household memberships" ON household_members;
DROP POLICY IF EXISTS "Owner manages household members" ON household_members;
DROP POLICY IF EXISTS "Owner manages invites" ON household_invites;

-- Drop old household RLS policies from data tables
-- (These were created in 00004_households.sql and will be replaced below)
DROP POLICY IF EXISTS "Household reads team config" ON admin_config;
DROP POLICY IF EXISTS "Household updates team config" ON admin_config;
DROP POLICY IF EXISTS "Owner inserts team config" ON admin_config;
DROP POLICY IF EXISTS "Owner deletes team config" ON admin_config;

DROP POLICY IF EXISTS "Household reads tournaments" ON tournaments;
DROP POLICY IF EXISTS "Household updates tournaments" ON tournaments;
DROP POLICY IF EXISTS "Owner inserts tournaments" ON tournaments;
DROP POLICY IF EXISTS "Owner deletes tournaments" ON tournaments;

DROP POLICY IF EXISTS "Household reads hotel bookings" ON hotel_bookings;
DROP POLICY IF EXISTS "Household updates hotel bookings" ON hotel_bookings;
DROP POLICY IF EXISTS "Owner inserts hotel bookings" ON hotel_bookings;
DROP POLICY IF EXISTS "Owner deletes hotel bookings" ON hotel_bookings;

DROP POLICY IF EXISTS "Household reads flight bookings" ON flight_bookings;
DROP POLICY IF EXISTS "Household updates flight bookings" ON flight_bookings;
DROP POLICY IF EXISTS "Owner inserts flight bookings" ON flight_bookings;
DROP POLICY IF EXISTS "Owner deletes flight bookings" ON flight_bookings;

DROP POLICY IF EXISTS "Household reads guests" ON guests;
DROP POLICY IF EXISTS "Household updates guests" ON guests;
DROP POLICY IF EXISTS "Owner inserts guests" ON guests;
DROP POLICY IF EXISTS "Owner deletes guests" ON guests;

DROP POLICY IF EXISTS "Household reads tournament guests" ON tournament_guests;
DROP POLICY IF EXISTS "Household updates tournament guests" ON tournament_guests;
DROP POLICY IF EXISTS "Owner inserts tournament guests" ON tournament_guests;
DROP POLICY IF EXISTS "Owner deletes tournament guests" ON tournament_guests;

DROP POLICY IF EXISTS "Household reads team events" ON team_events;
DROP POLICY IF EXISTS "Household updates team events" ON team_events;
DROP POLICY IF EXISTS "Owner inserts team events" ON team_events;
DROP POLICY IF EXISTS "Owner deletes team events" ON team_events;

DROP POLICY IF EXISTS "Household reads USAV profiles" ON usav_profiles;
DROP POLICY IF EXISTS "Household updates USAV profiles" ON usav_profiles;
DROP POLICY IF EXISTS "Owner inserts USAV profiles" ON usav_profiles;
DROP POLICY IF EXISTS "Owner deletes USAV profiles" ON usav_profiles;

DROP POLICY IF EXISTS "Household reads forwarded emails" ON forwarded_emails;
DROP POLICY IF EXISTS "Household updates forwarded emails" ON forwarded_emails;
DROP POLICY IF EXISTS "Owner inserts forwarded emails" ON forwarded_emails;
DROP POLICY IF EXISTS "Owner deletes forwarded emails" ON forwarded_emails;

-- Drop household function and RPC
DROP FUNCTION IF EXISTS household_user_ids();
DROP FUNCTION IF EXISTS accept_household_invite(TEXT);

-- Drop household tables
DROP TABLE IF EXISTS household_invites;
DROP TABLE IF EXISTS household_members;

-- Drop household_role enum (keep invite_status — reused by athlete_invites)
DROP TYPE IF EXISTS household_role;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- my_athlete_ids(): returns athlete IDs the current user can access
CREATE OR REPLACE FUNCTION my_athlete_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- As admin: athletes via admin_athletes junction
    SELECT athlete_id FROM admin_athletes WHERE admin_id = auth.uid()
    UNION
    -- As athlete: own athlete record
    SELECT id FROM athletes WHERE user_id = auth.uid()
$$;

-- my_season_ids(): returns season IDs for accessible athletes
CREATE OR REPLACE FUNCTION my_season_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.id
    FROM seasons s
    WHERE s.athlete_id IN (SELECT my_athlete_ids())
$$;

-- can_write_athlete(athlete_id): true if admin with 'manage' OR athlete with can_edit
CREATE OR REPLACE FUNCTION can_write_athlete(p_athlete_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        -- Admin with manage permission
        SELECT 1 FROM admin_athletes
        WHERE admin_id = auth.uid()
          AND athlete_id = p_athlete_id
          AND permission = 'manage'
    ) OR EXISTS (
        -- Athlete with can_edit flag
        SELECT 1 FROM athletes
        WHERE id = p_athlete_id
          AND user_id = auth.uid()
          AND can_edit = true
    )
$$;

-- ============================================================
-- NEW RLS POLICIES
-- ============================================================

-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- athletes
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read accessible athletes"
    ON athletes FOR SELECT
    USING (id IN (SELECT my_athlete_ids()));

CREATE POLICY "Admins manage athletes"
    ON athletes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins update athletes"
    ON athletes FOR UPDATE
    USING (can_write_athlete(id));

CREATE POLICY "Admins delete athletes"
    ON athletes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM admin_athletes
            WHERE admin_id = auth.uid()
              AND athlete_id = athletes.id
              AND permission = 'manage'
        )
    );

-- admin_athletes
ALTER TABLE admin_athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own admin_athletes"
    ON admin_athletes FOR SELECT
    USING (admin_id = auth.uid() OR athlete_id IN (SELECT id FROM athletes WHERE user_id = auth.uid()));

CREATE POLICY "Admins manage admin_athletes"
    ON admin_athletes FOR INSERT
    WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Admins delete admin_athletes"
    ON admin_athletes FOR DELETE
    USING (admin_id = auth.uid());

-- seasons
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read accessible seasons"
    ON seasons FOR SELECT
    USING (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Admins insert seasons"
    ON seasons FOR INSERT
    WITH CHECK (can_write_athlete(athlete_id));

CREATE POLICY "Admins update seasons"
    ON seasons FOR UPDATE
    USING (can_write_athlete(athlete_id));

CREATE POLICY "Admins delete seasons"
    ON seasons FOR DELETE
    USING (can_write_athlete(athlete_id));

-- athlete_invites
ALTER TABLE athlete_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inviters manage invites"
    ON athlete_invites FOR ALL
    USING (inviter_id = auth.uid())
    WITH CHECK (inviter_id = auth.uid());

-- ---- admin_config (renamed from team_config) ----
CREATE POLICY "Users read own admin config"
    ON admin_config FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users update own admin config"
    ON admin_config FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users insert own admin config"
    ON admin_config FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own admin config"
    ON admin_config FOR DELETE
    USING (user_id = auth.uid());

-- ---- tournaments (now via season_id) ----
CREATE POLICY "Users read accessible tournaments"
    ON tournaments FOR SELECT
    USING (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Users update accessible tournaments"
    ON tournaments FOR UPDATE
    USING (season_id IN (SELECT my_season_ids()))
    WITH CHECK (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Users insert tournaments"
    ON tournaments FOR INSERT
    WITH CHECK (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Admins delete tournaments"
    ON tournaments FOR DELETE
    USING (season_id IN (SELECT my_season_ids()));

-- ---- hotel_bookings ----
CREATE POLICY "Users read accessible hotel bookings"
    ON hotel_bookings FOR SELECT
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users insert hotel bookings"
    ON hotel_bookings FOR INSERT
    WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Users update hotel bookings"
    ON hotel_bookings FOR UPDATE
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users delete hotel bookings"
    ON hotel_bookings FOR DELETE
    USING (auth.uid() = created_by_user_id);

-- ---- flight_bookings ----
CREATE POLICY "Users read accessible flight bookings"
    ON flight_bookings FOR SELECT
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users insert flight bookings"
    ON flight_bookings FOR INSERT
    WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Users update flight bookings"
    ON flight_bookings FOR UPDATE
    USING (
        tournament_id IN (
            SELECT t.id FROM tournaments t WHERE t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users delete flight bookings"
    ON flight_bookings FOR DELETE
    USING (auth.uid() = created_by_user_id);

-- ---- guests (now via athlete_id) ----
CREATE POLICY "Users read accessible guests"
    ON guests FOR SELECT
    USING (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Users insert guests"
    ON guests FOR INSERT
    WITH CHECK (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Users update guests"
    ON guests FOR UPDATE
    USING (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Admins delete guests"
    ON guests FOR DELETE
    USING (can_write_athlete(athlete_id));

-- ---- tournament_guests ----
CREATE POLICY "Users read accessible tournament guests"
    ON tournament_guests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tournaments t
            WHERE t.id = tournament_guests.tournament_id
            AND t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users insert tournament guests"
    ON tournament_guests FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tournaments t
            WHERE t.id = tournament_guests.tournament_id
            AND t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Users update tournament guests"
    ON tournament_guests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM tournaments t
            WHERE t.id = tournament_guests.tournament_id
            AND t.season_id IN (SELECT my_season_ids())
        )
    );

CREATE POLICY "Admins delete tournament guests"
    ON tournament_guests FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM tournaments t
            WHERE t.id = tournament_guests.tournament_id
            AND t.season_id IN (SELECT my_season_ids())
        )
    );

-- ---- team_events (now via season_id) ----
CREATE POLICY "Users read accessible team events"
    ON team_events FOR SELECT
    USING (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Users insert team events"
    ON team_events FOR INSERT
    WITH CHECK (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Users update team events"
    ON team_events FOR UPDATE
    USING (season_id IN (SELECT my_season_ids()));

CREATE POLICY "Admins delete team events"
    ON team_events FOR DELETE
    USING (season_id IN (SELECT my_season_ids()));

-- ---- usav_profiles (now via athlete_id) ----
CREATE POLICY "Users read accessible USAV profiles"
    ON usav_profiles FOR SELECT
    USING (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Users insert USAV profiles"
    ON usav_profiles FOR INSERT
    WITH CHECK (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Users update USAV profiles"
    ON usav_profiles FOR UPDATE
    USING (athlete_id IN (SELECT my_athlete_ids()));

CREATE POLICY "Admins delete USAV profiles"
    ON usav_profiles FOR DELETE
    USING (can_write_athlete(athlete_id));

-- ---- forwarded_emails (stays user_id — belongs to admin who synced) ----
CREATE POLICY "Users read own forwarded emails"
    ON forwarded_emails FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users insert own forwarded emails"
    ON forwarded_emails FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own forwarded emails"
    ON forwarded_emails FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users delete own forwarded emails"
    ON forwarded_emails FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================
-- NEW RPC: accept_athlete_invite(code TEXT)
-- ============================================================

CREATE OR REPLACE FUNCTION accept_athlete_invite(code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite athlete_invites%ROWTYPE;
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

        -- Check if already linked
        IF EXISTS (
            SELECT 1 FROM admin_athletes
            WHERE admin_id = auth.uid() AND athlete_id = v_invite.athlete_id
        ) THEN
            UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;
            RETURN json_build_object('success', true, 'message', 'Already linked');
        END IF;

        -- Create admin_athletes row
        INSERT INTO admin_athletes (admin_id, athlete_id, permission, is_primary)
        VALUES (auth.uid(), v_invite.athlete_id, v_invite.permission, false);

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
    END IF;

    -- Mark invite accepted
    UPDATE athlete_invites SET status = 'accepted' WHERE id = v_invite.id;

    RETURN json_build_object('success', true, 'message', 'Invite accepted successfully');
END;
$$;

-- ============================================================
-- TRIGGER: auto-create user_profiles on auth.users insert
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_profiles (id, role, display_name)
    VALUES (NEW.id, 'admin', NULL)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- UPDATED_AT TRIGGERS for new tables
-- ============================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON athletes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON seasons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
