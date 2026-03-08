-- RALLY: Household (Co-Parent) Sharing Migration
-- Allows a co-parent to share the admin parent's data via RLS

-- ============================================================
-- NEW ENUMS
-- ============================================================

CREATE TYPE household_role AS ENUM ('admin', 'member');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked');

-- ============================================================
-- NEW TABLES
-- ============================================================

CREATE TABLE household_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    member_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            household_role NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (owner_user_id, member_user_id),
    CHECK (owner_user_id != member_user_id)
);

CREATE TABLE household_invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    invite_code     TEXT NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    status          invite_status NOT NULL DEFAULT 'pending',
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (invite_code)
);

-- Indexes
CREATE INDEX idx_household_members_owner ON household_members(owner_user_id);
CREATE INDEX idx_household_members_member ON household_members(member_user_id);
CREATE INDEX idx_household_invites_code ON household_invites(invite_code);
CREATE INDEX idx_household_invites_owner ON household_invites(owner_user_id);

-- RLS for household tables
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

-- Household members: owner or member can read
CREATE POLICY "Users read own household memberships"
    ON household_members FOR SELECT
    USING (auth.uid() = owner_user_id OR auth.uid() = member_user_id);

-- Only owner can insert/delete household members
CREATE POLICY "Owner manages household members"
    ON household_members FOR DELETE
    USING (auth.uid() = owner_user_id);

-- Household invites: owner can manage
CREATE POLICY "Owner manages invites"
    ON household_invites FOR ALL
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);

-- Anyone authenticated can read their own invite (by email match — handled in RPC)

-- ============================================================
-- FUNCTION: household_user_ids()
-- Returns the set of user_ids whose data the current user can access.
-- For an admin parent: just their own uid.
-- For a co-parent: their own uid + the owner's uid.
-- ============================================================

CREATE OR REPLACE FUNCTION household_user_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid()
    UNION
    SELECT owner_user_id
    FROM household_members
    WHERE member_user_id = auth.uid()
$$;

-- ============================================================
-- RPC: accept_household_invite(code TEXT)
-- Called by co-parent after sign-up to link accounts.
-- ============================================================

CREATE OR REPLACE FUNCTION accept_household_invite(code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite household_invites%ROWTYPE;
BEGIN
    -- Find the invite
    SELECT * INTO v_invite
    FROM household_invites
    WHERE invite_code = code
      AND status = 'pending'
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    -- Prevent self-invite
    IF v_invite.owner_user_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Cannot accept your own invite');
    END IF;

    -- Check if already a member
    IF EXISTS (
        SELECT 1 FROM household_members
        WHERE owner_user_id = v_invite.owner_user_id
          AND member_user_id = auth.uid()
    ) THEN
        -- Mark invite accepted anyway
        UPDATE household_invites SET status = 'accepted' WHERE id = v_invite.id;
        RETURN json_build_object('success', true, 'message', 'Already linked');
    END IF;

    -- Create household membership
    INSERT INTO household_members (owner_user_id, member_user_id, role)
    VALUES (v_invite.owner_user_id, auth.uid(), 'member');

    -- Mark invite accepted
    UPDATE household_invites SET status = 'accepted' WHERE id = v_invite.id;

    RETURN json_build_object('success', true, 'message', 'Household linked successfully');
END;
$$;

-- ============================================================
-- UPDATED RLS POLICIES
-- Replace single-user policies with household-aware policies.
-- Pattern: SELECT/UPDATE use household_user_ids(), INSERT/DELETE use auth.uid()
-- ============================================================

-- Helper: drop old "FOR ALL" policies and create granular ones

-- ---- team_config ----
DROP POLICY "Users manage own team config" ON team_config;

CREATE POLICY "Household reads team config"
    ON team_config FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates team config"
    ON team_config FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts team config"
    ON team_config FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes team config"
    ON team_config FOR DELETE
    USING (auth.uid() = user_id);

-- ---- tournaments ----
DROP POLICY "Users manage own tournaments" ON tournaments;

CREATE POLICY "Household reads tournaments"
    ON tournaments FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates tournaments"
    ON tournaments FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts tournaments"
    ON tournaments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes tournaments"
    ON tournaments FOR DELETE
    USING (auth.uid() = user_id);

-- ---- hotel_bookings ----
DROP POLICY "Users manage own hotel bookings" ON hotel_bookings;

CREATE POLICY "Household reads hotel bookings"
    ON hotel_bookings FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates hotel bookings"
    ON hotel_bookings FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts hotel bookings"
    ON hotel_bookings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes hotel bookings"
    ON hotel_bookings FOR DELETE
    USING (auth.uid() = user_id);

-- ---- flight_bookings ----
DROP POLICY "Users manage own flight bookings" ON flight_bookings;

CREATE POLICY "Household reads flight bookings"
    ON flight_bookings FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates flight bookings"
    ON flight_bookings FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts flight bookings"
    ON flight_bookings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes flight bookings"
    ON flight_bookings FOR DELETE
    USING (auth.uid() = user_id);

-- ---- guests ----
DROP POLICY "Users manage own guests" ON guests;

CREATE POLICY "Household reads guests"
    ON guests FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates guests"
    ON guests FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts guests"
    ON guests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes guests"
    ON guests FOR DELETE
    USING (auth.uid() = user_id);

-- ---- tournament_guests ----
DROP POLICY "Users manage own tournament guests" ON tournament_guests;

CREATE POLICY "Household reads tournament guests"
    ON tournament_guests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id IN (SELECT household_user_ids())
        )
    );

CREATE POLICY "Household updates tournament guests"
    ON tournament_guests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id IN (SELECT household_user_ids())
        )
    );

CREATE POLICY "Owner inserts tournament guests"
    ON tournament_guests FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id = auth.uid()
        )
    );

CREATE POLICY "Owner deletes tournament guests"
    ON tournament_guests FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id = auth.uid()
        )
    );

-- ---- team_events ----
DROP POLICY "Users manage own team events" ON team_events;

CREATE POLICY "Household reads team events"
    ON team_events FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates team events"
    ON team_events FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts team events"
    ON team_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes team events"
    ON team_events FOR DELETE
    USING (auth.uid() = user_id);

-- ---- usav_profiles ----
DROP POLICY "Users manage own USAV profiles" ON usav_profiles;

CREATE POLICY "Household reads USAV profiles"
    ON usav_profiles FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates USAV profiles"
    ON usav_profiles FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts USAV profiles"
    ON usav_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes USAV profiles"
    ON usav_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- ---- forwarded_emails ----
DROP POLICY "Users manage own forwarded emails" ON forwarded_emails;

CREATE POLICY "Household reads forwarded emails"
    ON forwarded_emails FOR SELECT
    USING (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Household updates forwarded emails"
    ON forwarded_emails FOR UPDATE
    USING (user_id IN (SELECT household_user_ids()))
    WITH CHECK (user_id IN (SELECT household_user_ids()));

CREATE POLICY "Owner inserts forwarded emails"
    ON forwarded_emails FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner deletes forwarded emails"
    ON forwarded_emails FOR DELETE
    USING (auth.uid() = user_id);
