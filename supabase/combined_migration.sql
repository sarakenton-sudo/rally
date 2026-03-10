-- ============================================================
-- RALLY: Combined Migration (all 5 files)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- MIGRATION 1: CORE SCHEMA
-- ============================================================

CREATE TYPE tournament_status AS ENUM ('upcoming', 'travel_needed', 'booked', 'complete');
CREATE TYPE booking_platform AS ENUM ('Bonvoy', 'Booking.com', 'Travel Source', 'Expedia', 'Direct', 'Other');
CREATE TYPE booking_status AS ENUM ('tentative', 'confirmed', 'cancelled');
CREATE TYPE rsvp_status AS ENUM ('pending', 'yes', 'no', 'maybe');
CREATE TYPE notification_pref AS ENUM ('sms');
CREATE TYPE email_classification AS ENUM ('stay_and_play', 'travel_confirmation', 'coach_announcement', 'schedule_change', 'tournament_info', 'other');
CREATE TYPE email_action AS ENUM ('booking_alert_sent', 'travel_import_queued', 'notification_sent', 'none');
CREATE TYPE streaming_platform AS ENUM ('YouTube', 'GameChanger', 'Baller.tv', 'Other');

CREATE TABLE team_config (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_name   TEXT NOT NULL,
    season_year TEXT NOT NULL,
    team_code   TEXT,
    athlete_name TEXT,
    club_email_domain TEXT,
    rally_forward_address TEXT NOT NULL DEFAULT 'plans@rallyhub.com',
    trusted_sender_emails TEXT[] NOT NULL DEFAULT '{}',
    vip_sender_emails TEXT[] NOT NULL DEFAULT '{}',
    notification_preferences JSONB NOT NULL DEFAULT '{"tournament_reminders":true,"cancellation_deadlines":true,"email_arrivals":true,"rsvp_responses":true,"schedule_changes":true}',
    ical_feed_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    youtube_channel_id TEXT,
    default_streaming_platform streaming_platform,
    default_stream_url TEXT,
    travel_sync_emails TEXT[] NOT NULL DEFAULT '{}',
    schedule_import_source TEXT,
    schedule_import_connected BOOLEAN NOT NULL DEFAULT false,
    external_links JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, season_year)
);

CREATE TABLE tournaments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    location_city   TEXT NOT NULL,
    venues          JSONB NOT NULL DEFAULT '[]',
    travel_required BOOLEAN NOT NULL DEFAULT false,
    ticket_system   TEXT,
    ticket_link     TEXT,
    aes_tournament_id TEXT,
    aes_feed_data   JSONB,
    aes_feed_last_updated TIMESTAMPTZ,
    aes_feed_available BOOLEAN NOT NULL DEFAULT true,
    sportwrench_url TEXT,
    tickets_purchased BOOLEAN NOT NULL DEFAULT false,
    air_not_needed BOOLEAN NOT NULL DEFAULT false,
    hotel_not_needed BOOLEAN NOT NULL DEFAULT false,
    streaming_links JSONB NOT NULL DEFAULT '[]',
    status          tournament_status NOT NULL DEFAULT 'upcoming',
    source_platform TEXT,
    source_event_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hotel_bookings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    hotel_name            TEXT NOT NULL,
    platform              booking_platform NOT NULL DEFAULT 'Other',
    booking_name          TEXT NOT NULL DEFAULT '',
    booked_by             TEXT NOT NULL DEFAULT '',
    reservation_number    TEXT NOT NULL DEFAULT '',
    check_in              DATE NOT NULL,
    check_out             DATE NOT NULL,
    cancellation_deadline DATE,
    cost                  NUMERIC(10,2),
    is_backup             BOOLEAN NOT NULL DEFAULT false,
    status                booking_status NOT NULL DEFAULT 'tentative',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flight_bookings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    airline           TEXT NOT NULL,
    confirmation_code TEXT NOT NULL DEFAULT '',
    departure_date    DATE NOT NULL,
    return_date       DATE NOT NULL,
    booked_by         TEXT NOT NULL DEFAULT '',
    traveler_names    TEXT[] NOT NULL DEFAULT '{}',
    cost              NUMERIC(10,2),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    phone             TEXT NOT NULL,
    email             TEXT,
    relationship      TEXT NOT NULL DEFAULT '',
    notification_pref notification_pref NOT NULL DEFAULT 'sms',
    default_invited   BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tournament_guests (
    tournament_id       UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    guest_id            UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    invited             BOOLEAN NOT NULL DEFAULT true,
    rsvp_status         rsvp_status NOT NULL DEFAULT 'pending',
    attending_in_person BOOLEAN NOT NULL DEFAULT true,
    ticket_purchased    BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, guest_id)
);

CREATE TABLE team_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_id       UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    date                DATE NOT NULL,
    time                TIME,
    venue_name          TEXT NOT NULL DEFAULT '',
    address             TEXT NOT NULL DEFAULT '',
    reservation_name    TEXT,
    reservation_number  TEXT,
    party_size          INTEGER,
    notes               TEXT,
    family_welcome      BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usav_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    member_name          TEXT NOT NULL,
    member_id            TEXT NOT NULL,
    club_affiliation     TEXT NOT NULL DEFAULT '',
    expiration_date      DATE NOT NULL,
    membership_card_file TEXT,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE forwarded_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_address    TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    body_text       TEXT NOT NULL DEFAULT '',
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    classification  email_classification,
    action_taken    email_action NOT NULL DEFAULT 'none',
    raw_storage_url TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX idx_tournaments_start_date ON tournaments(start_date);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_hotel_bookings_tournament_id ON hotel_bookings(tournament_id);
CREATE INDEX idx_hotel_bookings_user_id ON hotel_bookings(user_id);
CREATE INDEX idx_hotel_bookings_cancellation ON hotel_bookings(cancellation_deadline)
    WHERE cancellation_deadline IS NOT NULL AND status != 'cancelled';
CREATE INDEX idx_flight_bookings_tournament_id ON flight_bookings(tournament_id);
CREATE INDEX idx_flight_bookings_user_id ON flight_bookings(user_id);
CREATE INDEX idx_guests_user_id ON guests(user_id);
CREATE INDEX idx_tournament_guests_guest_id ON tournament_guests(guest_id);
CREATE INDEX idx_team_events_user_id ON team_events(user_id);
CREATE INDEX idx_team_events_tournament_id ON team_events(tournament_id);
CREATE INDEX idx_team_events_date ON team_events(date);
CREATE INDEX idx_forwarded_emails_user_id ON forwarded_emails(user_id);
CREATE INDEX idx_forwarded_emails_received_at ON forwarded_emails(received_at);
CREATE INDEX idx_team_config_user_id ON team_config(user_id);
CREATE INDEX idx_team_config_ical_token ON team_config(ical_feed_token);

-- ROW LEVEL SECURITY
ALTER TABLE team_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usav_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE forwarded_emails ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (will be replaced by household-aware policies in migration 4)
CREATE POLICY "Users manage own team config"
    ON team_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tournaments"
    ON tournaments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own hotel bookings"
    ON hotel_bookings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own flight bookings"
    ON flight_bookings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own guests"
    ON guests FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tournament guests"
    ON tournament_guests FOR ALL
    USING (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id = auth.uid()));
CREATE POLICY "Users manage own team events"
    ON team_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own USAV profiles"
    ON usav_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own forwarded emails"
    ON forwarded_emails FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON team_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hotel_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON flight_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON team_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usav_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MIGRATION 2: ADMIN TABLES
-- ============================================================

CREATE TABLE admin_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'viewer')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE notification_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guest_id          UUID REFERENCES guests(id) ON DELETE SET NULL,
    tournament_id     UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL,
    channel           TEXT NOT NULL CHECK (channel IN ('push', 'sms', 'email')),
    message           TEXT NOT NULL DEFAULT '',
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at      TIMESTAMPTZ,
    opened_at         TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'failed', 'bounced'))
);

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_type ON notification_log(notification_type);
CREATE INDEX idx_notification_log_sent_at ON notification_log(sent_at);
CREATE INDEX idx_notification_log_status ON notification_log(status);

CREATE TABLE feature_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_feature_events_user_id ON feature_events(user_id);
CREATE INDEX idx_feature_events_type ON feature_events(event_type);
CREATE INDEX idx_feature_events_occurred_at ON feature_events(occurred_at);

CREATE TABLE guest_code_views (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id      UUID REFERENCES guests(id) ON DELETE SET NULL,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    copied        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_guest_code_views_guest_id ON guest_code_views(guest_id);
CREATE INDEX idx_guest_code_views_tournament_id ON guest_code_views(tournament_id);

CREATE TABLE app_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    screen_path JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_app_sessions_user_id ON app_sessions(user_id);
CREATE INDEX idx_app_sessions_started_at ON app_sessions(started_at);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_code_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
    ON notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts notifications"
    ON notification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Users read own feature events"
    ON feature_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts feature events"
    ON feature_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone inserts guest code views"
    ON guest_code_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Users manage own sessions"
    ON app_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read admin users"
    ON admin_users FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.email = auth.jwt()->>'email'));

-- ============================================================
-- MIGRATION 4: HOUSEHOLDS (co-parent sharing)
-- ============================================================

CREATE TYPE household_role AS ENUM ('admin', 'member');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked');

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

CREATE INDEX idx_household_members_owner ON household_members(owner_user_id);
CREATE INDEX idx_household_members_member ON household_members(member_user_id);
CREATE INDEX idx_household_invites_code ON household_invites(invite_code);
CREATE INDEX idx_household_invites_owner ON household_invites(owner_user_id);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own household memberships"
    ON household_members FOR SELECT
    USING (auth.uid() = owner_user_id OR auth.uid() = member_user_id);
CREATE POLICY "Owner manages household members"
    ON household_members FOR DELETE USING (auth.uid() = owner_user_id);
CREATE POLICY "Owner manages invites"
    ON household_invites FOR ALL
    USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE OR REPLACE FUNCTION household_user_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT auth.uid()
    UNION
    SELECT owner_user_id FROM household_members WHERE member_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION accept_household_invite(code TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_invite household_invites%ROWTYPE;
BEGIN
    SELECT * INTO v_invite FROM household_invites
    WHERE invite_code = code AND status = 'pending' AND expires_at > now() LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;
    IF v_invite.owner_user_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Cannot accept your own invite');
    END IF;
    IF EXISTS (SELECT 1 FROM household_members WHERE owner_user_id = v_invite.owner_user_id AND member_user_id = auth.uid()) THEN
        UPDATE household_invites SET status = 'accepted' WHERE id = v_invite.id;
        RETURN json_build_object('success', true, 'message', 'Already linked');
    END IF;
    INSERT INTO household_members (owner_user_id, member_user_id, role) VALUES (v_invite.owner_user_id, auth.uid(), 'member');
    UPDATE household_invites SET status = 'accepted' WHERE id = v_invite.id;
    RETURN json_build_object('success', true, 'message', 'Household linked successfully');
END;
$$;

-- Replace single-user RLS policies with household-aware ones
DROP POLICY "Users manage own team config" ON team_config;
CREATE POLICY "Household reads team config" ON team_config FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates team config" ON team_config FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts team config" ON team_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes team config" ON team_config FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own tournaments" ON tournaments;
CREATE POLICY "Household reads tournaments" ON tournaments FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates tournaments" ON tournaments FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts tournaments" ON tournaments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes tournaments" ON tournaments FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own hotel bookings" ON hotel_bookings;
CREATE POLICY "Household reads hotel bookings" ON hotel_bookings FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates hotel bookings" ON hotel_bookings FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts hotel bookings" ON hotel_bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes hotel bookings" ON hotel_bookings FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own flight bookings" ON flight_bookings;
CREATE POLICY "Household reads flight bookings" ON flight_bookings FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates flight bookings" ON flight_bookings FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts flight bookings" ON flight_bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes flight bookings" ON flight_bookings FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own guests" ON guests;
CREATE POLICY "Household reads guests" ON guests FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates guests" ON guests FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts guests" ON guests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes guests" ON guests FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own tournament guests" ON tournament_guests;
CREATE POLICY "Household reads tournament guests" ON tournament_guests FOR SELECT USING (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id IN (SELECT household_user_ids())));
CREATE POLICY "Household updates tournament guests" ON tournament_guests FOR UPDATE USING (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id IN (SELECT household_user_ids())));
CREATE POLICY "Owner inserts tournament guests" ON tournament_guests FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id = auth.uid()));
CREATE POLICY "Owner deletes tournament guests" ON tournament_guests FOR DELETE USING (EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_guests.tournament_id AND tournaments.user_id = auth.uid()));

DROP POLICY "Users manage own team events" ON team_events;
CREATE POLICY "Household reads team events" ON team_events FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates team events" ON team_events FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts team events" ON team_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes team events" ON team_events FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own USAV profiles" ON usav_profiles;
CREATE POLICY "Household reads USAV profiles" ON usav_profiles FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates USAV profiles" ON usav_profiles FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts USAV profiles" ON usav_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes USAV profiles" ON usav_profiles FOR DELETE USING (auth.uid() = user_id);

DROP POLICY "Users manage own forwarded emails" ON forwarded_emails;
CREATE POLICY "Household reads forwarded emails" ON forwarded_emails FOR SELECT USING (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Household updates forwarded emails" ON forwarded_emails FOR UPDATE USING (user_id IN (SELECT household_user_ids())) WITH CHECK (user_id IN (SELECT household_user_ids()));
CREATE POLICY "Owner inserts forwarded emails" ON forwarded_emails FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes forwarded emails" ON forwarded_emails FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 5: GMAIL OAUTH (table + columns only, no cron)
-- ============================================================

CREATE TABLE gmail_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  gmail_email TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  sync_errors INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT gmail_tokens_user_id_unique UNIQUE (user_id)
);

ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER gmail_tokens_updated_at
  BEFORE UPDATE ON gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE team_config
  ADD COLUMN gmail_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gmail_email TEXT;

ALTER TABLE forwarded_emails
  ADD COLUMN source TEXT NOT NULL DEFAULT 'forward',
  ADD COLUMN gmail_message_id TEXT;

CREATE UNIQUE INDEX idx_forwarded_emails_gmail_message_id
  ON forwarded_emails (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;
