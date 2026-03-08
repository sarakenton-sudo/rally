-- RALLY: Core Schema Migration
-- Select Volleyball Family Hub
-- All tables, enums, indexes, and RLS policies

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE tournament_status AS ENUM ('upcoming', 'travel_needed', 'booked', 'complete');
CREATE TYPE booking_platform AS ENUM ('Bonvoy', 'Booking.com', 'Travel Source', 'Expedia', 'Direct', 'Other');
CREATE TYPE booking_status AS ENUM ('tentative', 'confirmed', 'cancelled');
CREATE TYPE rsvp_status AS ENUM ('pending', 'yes', 'no', 'maybe');
CREATE TYPE notification_pref AS ENUM ('sms');
CREATE TYPE email_classification AS ENUM ('stay_and_play', 'travel_confirmation', 'coach_announcement', 'schedule_change', 'tournament_info', 'other');
CREATE TYPE email_action AS ENUM ('booking_alert_sent', 'travel_import_queued', 'notification_sent', 'none');
CREATE TYPE streaming_platform AS ENUM ('YouTube', 'GameChanger', 'Baller.tv', 'Other');

-- ============================================================
-- TABLES
-- ============================================================

-- Team configuration (one record per season per user)
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

-- Tournaments
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

-- Hotel bookings
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

-- Flight bookings
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

-- Guests (grandparents, family, friends)
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

-- Tournament-Guest junction (RSVP tracking)
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

-- Team events (dinners, lunches, banquets)
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

-- USA Volleyball profiles
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

-- Forwarded emails (plans@rallyhub.com inbox)
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

-- ============================================================
-- INDEXES
-- ============================================================

-- Tournaments
CREATE INDEX idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX idx_tournaments_start_date ON tournaments(start_date);
CREATE INDEX idx_tournaments_status ON tournaments(status);

-- Hotel bookings
CREATE INDEX idx_hotel_bookings_tournament_id ON hotel_bookings(tournament_id);
CREATE INDEX idx_hotel_bookings_user_id ON hotel_bookings(user_id);
CREATE INDEX idx_hotel_bookings_cancellation ON hotel_bookings(cancellation_deadline)
    WHERE cancellation_deadline IS NOT NULL AND status != 'cancelled';

-- Flight bookings
CREATE INDEX idx_flight_bookings_tournament_id ON flight_bookings(tournament_id);
CREATE INDEX idx_flight_bookings_user_id ON flight_bookings(user_id);

-- Guests
CREATE INDEX idx_guests_user_id ON guests(user_id);

-- Tournament guests
CREATE INDEX idx_tournament_guests_guest_id ON tournament_guests(guest_id);

-- Team events
CREATE INDEX idx_team_events_user_id ON team_events(user_id);
CREATE INDEX idx_team_events_tournament_id ON team_events(tournament_id);
CREATE INDEX idx_team_events_date ON team_events(date);

-- Forwarded emails
CREATE INDEX idx_forwarded_emails_user_id ON forwarded_emails(user_id);
CREATE INDEX idx_forwarded_emails_received_at ON forwarded_emails(received_at);

-- Team config
CREATE INDEX idx_team_config_user_id ON team_config(user_id);
CREATE INDEX idx_team_config_ical_token ON team_config(ical_feed_token);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE team_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usav_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE forwarded_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own data
-- team_config
CREATE POLICY "Users manage own team config"
    ON team_config FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- tournaments
CREATE POLICY "Users manage own tournaments"
    ON tournaments FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- hotel_bookings
CREATE POLICY "Users manage own hotel bookings"
    ON hotel_bookings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- flight_bookings
CREATE POLICY "Users manage own flight bookings"
    ON flight_bookings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- guests
CREATE POLICY "Users manage own guests"
    ON guests FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- tournament_guests (user owns the tournament)
CREATE POLICY "Users manage own tournament guests"
    ON tournament_guests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_guests.tournament_id
            AND tournaments.user_id = auth.uid()
        )
    );

-- team_events
CREATE POLICY "Users manage own team events"
    ON team_events FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- usav_profiles
CREATE POLICY "Users manage own USAV profiles"
    ON usav_profiles FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- forwarded_emails
CREATE POLICY "Users manage own forwarded emails"
    ON forwarded_emails FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON team_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tournaments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hotel_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON flight_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON guests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON team_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usav_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
