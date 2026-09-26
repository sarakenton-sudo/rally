-- ================================================================
-- Coaching & Lessons module — combined migrations 00054–00059
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Fully transaction-safe; re-runnable (teardown drops any partial attempt first).
-- ================================================================

-- ---- Teardown (idempotent re-run) ----
DROP TABLE IF EXISTS payment_events CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS booking_requests CASCADE;
DROP TABLE IF EXISTS slots CASCADE;
DROP TABLE IF EXISTS availability_rules CASCADE;
DROP TABLE IF EXISTS session_types CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;
DROP TABLE IF EXISTS coach_connections CASCADE;
DROP TABLE IF EXISTS coaching_notification_prefs CASCADE;
DROP TABLE IF EXISTS coaches CASCADE;
DROP FUNCTION IF EXISTS get_public_coach(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_coach() CASCADE;
DROP FUNCTION IF EXISTS my_coach_id() CASCADE;
DROP FUNCTION IF EXISTS my_connected_coach_ids() CASCADE;
DROP FUNCTION IF EXISTS request_booking(UUID,UUID,UUID,TEXT,TEXT,TEXT[],INT) CASCADE;
DROP FUNCTION IF EXISTS accept_booking_request(UUID) CASCADE;
DROP FUNCTION IF EXISTS decline_booking_request(UUID,TEXT) CASCADE;
DROP FUNCTION IF EXISTS cancel_booking(UUID) CASCADE;
DROP FUNCTION IF EXISTS expire_booking_requests() CASCADE;
DROP FUNCTION IF EXISTS get_coach_request_detail(UUID) CASCADE;
DROP POLICY IF EXISTS "Public read coach photos" ON storage.objects;
DROP POLICY IF EXISTS "Coaches upload own photo" ON storage.objects;
DROP POLICY IF EXISTS "Coaches update own photo" ON storage.objects;
DROP POLICY IF EXISTS "Coaches delete own photo" ON storage.objects;


-- ===================== 00054_coaching_core.sql =====================
-- ============================================================
-- Coaching & Lessons Module — Core schema (PR 1 of the build spec)
-- coaches (the "listing"), athlete profile fields, coach_connections (roster)
-- See docs/coaching-build-spec.md §2.1
-- ============================================================

-- ------------------------------------------------------------
-- Role note: we intentionally do NOT add a 'coach' value to the user_role enum here.
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block (the Supabase SQL
-- editor wraps the whole script in one transaction), and it would abort the run.
-- Coach capability is determined by OWNING a `coaches` row (see my_coach_id()), not by
-- the role column — so the enum value isn't needed. is_coach() uses a text comparison
-- (`role::text = 'coach'`) which is harmless whether or not the label exists. If a pure
-- "coach-only" role is wanted later, add it in its own standalone (non-transactional)
-- migration: ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coach';
-- ------------------------------------------------------------

-- ============================================================
-- COACHES  (the Airbnb-style listing)
-- ============================================================
CREATE TABLE coaches (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name                TEXT NOT NULL,
    photo_url                   TEXT,
    bio                         TEXT,
    specialties                 TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {setting,defense,recruiting}
    sport                       TEXT NOT NULL DEFAULT 'volleyball',
    certifications              JSONB NOT NULL DEFAULT '[]',    -- [{label,number,status}]
    safesport_status            TEXT,                           -- 'verified' | 'self_attested' | null
    identity_verified           BOOLEAN NOT NULL DEFAULT false, -- mirrors Stripe Connect KYC
    default_timezone            TEXT NOT NULL DEFAULT 'America/Chicago',
    visibility                  TEXT NOT NULL DEFAULT 'private'
                                  CHECK (visibility IN ('public','private')),
    invite_code                 TEXT UNIQUE,                    -- private invite-gating
    cost_tier                   TEXT CHECK (cost_tier IN ('$','$$','$$$')),
    fee_handling                TEXT NOT NULL DEFAULT 'absorb'
                                  CHECK (fee_handling IN ('absorb','surcharge')),
    instant_book_default        BOOLEAN NOT NULL DEFAULT false,
    cancellation_policy_version TEXT NOT NULL DEFAULT 'v1-standard',
    slug                        TEXT UNIQUE,                    -- public profile URL: /coach/[slug]
    stripe_account_id           TEXT,                           -- Stripe Connect acct (populated in later PR)
    onboarding_complete         BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coaches_public ON coaches(visibility) WHERE visibility = 'public';
CREATE INDEX idx_coaches_user ON coaches(user_id);

-- ============================================================
-- ATHLETE PROFILE  (extend existing athletes — conveyed to coach at request)
-- ============================================================
ALTER TABLE athletes
    ADD COLUMN IF NOT EXISTS grad_year     INT,
    ADD COLUMN IF NOT EXISTS positions     TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS level         TEXT,        -- coach-judged; self-reported in v1
    ADD COLUMN IF NOT EXISTS club_team     TEXT,
    ADD COLUMN IF NOT EXISTS height_inches INT,
    ADD COLUMN IF NOT EXISTS goals         TEXT;

-- ============================================================
-- COACH CONNECTION  (the roster — links coach <-> parent account, optional athlete)
-- Independent of teams/seasons.
-- ============================================================
CREATE TABLE coach_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('invited','active')),
    invited_email   TEXT,
    invited_phone   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, parent_user_id)
);

CREATE INDEX idx_coach_connections_coach  ON coach_connections(coach_id);
CREATE INDEX idx_coach_connections_parent ON coach_connections(parent_user_id);

-- ============================================================
-- FACILITIES  (1:many — a coach can run lessons at multiple gyms; availability
-- and slots attach to a specific facility, and clients can book at a chosen one)
-- ============================================================
CREATE TABLE facilities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id     UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    address      TEXT,
    city         TEXT,
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    notes        TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_facilities_coach ON facilities(coach_id);

-- ============================================================
-- RLS HELPER FUNCTIONS  (SECURITY DEFINER, mirror my_athlete_ids() in 00009)
-- ============================================================

-- is_coach(): true if the current user holds the coach role
CREATE OR REPLACE FUNCTION is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role::text = 'coach'
    )
$$;

-- my_coach_id(): the coaches.id owned by the current user (NULL if none)
CREATE OR REPLACE FUNCTION my_coach_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM coaches WHERE user_id = auth.uid()
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- coaches: owner + connected parents only. Public discovery is served exclusively
-- through get_public_coach() (below) so sensitive columns (stripe_account_id) never
-- reach anon via the REST API.
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches read own or connected listing"
    ON coaches FOR SELECT
    USING (
        user_id = auth.uid()
        OR id IN (
            SELECT coach_id FROM coach_connections WHERE parent_user_id = auth.uid()
        )
    );

CREATE POLICY "Coaches insert own listing"
    ON coaches FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coaches update own listing"
    ON coaches FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coaches delete own listing"
    ON coaches FOR DELETE
    USING (user_id = auth.uid());

-- coach_connections: visible/editable to the owning coach and the parent on the row.
ALTER TABLE coach_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Connections read by coach or parent"
    ON coach_connections FOR SELECT
    USING (
        coach_id = my_coach_id()
        OR parent_user_id = auth.uid()
    );

CREATE POLICY "Connections insert by coach or parent"
    ON coach_connections FOR INSERT
    WITH CHECK (
        coach_id = my_coach_id()
        OR parent_user_id = auth.uid()
    );

CREATE POLICY "Connections update by coach or parent"
    ON coach_connections FOR UPDATE
    USING (
        coach_id = my_coach_id()
        OR parent_user_id = auth.uid()
    );

CREATE POLICY "Connections delete by coach or parent"
    ON coach_connections FOR DELETE
    USING (
        coach_id = my_coach_id()
        OR parent_user_id = auth.uid()
    );

-- facilities: coach manages own; connected parents read active facilities (for
-- booking selection). Public discovery reads facilities through get_public_coach().
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Facilities read by coach or connected parent"
    ON facilities FOR SELECT
    USING (
        coach_id = my_coach_id()
        OR (is_active AND coach_id IN (
            SELECT coach_id FROM coach_connections WHERE parent_user_id = auth.uid()
        ))
    );

CREATE POLICY "Facilities insert by coach"
    ON facilities FOR INSERT
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Facilities update by coach"
    ON facilities FOR UPDATE
    USING (coach_id = my_coach_id())
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Facilities delete by coach"
    ON facilities FOR DELETE
    USING (coach_id = my_coach_id());

-- ============================================================
-- PUBLIC LISTING RPC  (anon + authenticated; returns listing-safe columns only)
-- Mirrors the submit_lead() anon-RPC pattern in 00052. Includes the coach's
-- active facilities so a prospective client can see/choose where to book.
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_coach(p_slug TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT row_to_json(c) FROM (
        SELECT
            co.id, co.display_name, co.photo_url, co.bio, co.specialties, co.sport,
            co.certifications, co.safesport_status, co.identity_verified,
            co.default_timezone, co.cost_tier, co.slug,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'id', f.id, 'label', f.label, 'address', f.address, 'city', f.city,
                    'lat', f.lat, 'lng', f.lng) ORDER BY f.sort_order)
                FROM facilities f
                WHERE f.coach_id = co.id AND f.is_active
            ), '[]'::json) AS facilities
        FROM coaches co
        WHERE co.slug = p_slug AND co.visibility = 'public'
    ) c
$$;

GRANT EXECUTE ON FUNCTION get_public_coach(TEXT) TO anon, authenticated;

-- ============================================================
-- UPDATED_AT TRIGGERS  (reuse update_updated_at() from 00001)
-- ============================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON coaches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON facilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================== 00055_coaching_sessions_availability.sql =====================
-- ============================================================
-- Coaching & Lessons Module — Session types + availability (PR 2)
-- session_types (what), availability_rules (recurring template),
-- slots (bookable instances, with transaction-safe double-booking guard)
-- See docs/coaching-build-spec.md §2.2
-- ============================================================

-- btree_gist lets an EXCLUDE constraint mix equality (coach_id) with a range
-- overlap (&&) — the transaction-safe double-booking guard on slots below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- SESSION TYPES  (configurable; v1 ships private_1 / semi_2, rest are Phase 2)
-- ============================================================
CREATE TABLE session_types (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id           UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    kind               TEXT NOT NULL
                         CHECK (kind IN ('private_1','semi_2','small_group','clinic','camp')),
    name               TEXT NOT NULL,
    description        TEXT,
    location_label     TEXT,
    price_cents        INT NOT NULL CHECK (price_cents >= 0),
    duration_min       INT NOT NULL CHECK (duration_min > 0),
    capacity           INT NOT NULL DEFAULT 1 CHECK (capacity >= 1),  -- v1 uses 1-2; 3+ Phase 2
    eligible_min_level TEXT,                                          -- advisory gate in v1
    booking_mode       TEXT NOT NULL DEFAULT 'request'
                         CHECK (booking_mode IN ('request','instant')),
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_types_coach ON session_types(coach_id);

-- ============================================================
-- AVAILABILITY RULES  (recurring weekly template; coach-internal)
-- ============================================================
CREATE TABLE availability_rules (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                  UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    facility_id               UUID REFERENCES facilities(id) ON DELETE CASCADE, -- where these hours apply
    weekday                   INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun
    start_time                TIME NOT NULL,
    end_time                  TIME NOT NULL,
    timezone                  TEXT NOT NULL,
    visibility                TEXT NOT NULL DEFAULT 'all'
                                CHECK (visibility IN ('all','individual')),  -- 'group' = Phase 2
    shared_with_connection_id UUID REFERENCES coach_connections(id) ON DELETE CASCADE,
    is_active                 BOOLEAN NOT NULL DEFAULT true,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_availability_rules_coach ON availability_rules(coach_id);
CREATE INDEX idx_availability_rules_facility ON availability_rules(facility_id);

-- ============================================================
-- SLOTS  (concrete bookable instances + block-time)
-- ============================================================
CREATE TABLE slots (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                  UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    facility_id               UUID REFERENCES facilities(id) ON DELETE SET NULL,  -- where this lesson is
    session_type_id           UUID REFERENCES session_types(id) ON DELETE SET NULL,
    starts_at                 TIMESTAMPTZ NOT NULL,
    ends_at                   TIMESTAMPTZ NOT NULL,
    status                    TEXT NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open','held','booked','blocked')),
    seats_total               INT NOT NULL DEFAULT 1 CHECK (seats_total >= 1),
    seats_taken               INT NOT NULL DEFAULT 0 CHECK (seats_taken >= 0 AND seats_taken <= seats_total),
    visibility                TEXT NOT NULL DEFAULT 'all'
                                CHECK (visibility IN ('all','individual')),
    shared_with_connection_id UUID REFERENCES coach_connections(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    -- A coach cannot have two overlapping held/booked slots. Enforced in-DB so the
    -- last-seat race (spec §7.12) fails the losing transaction before any payment.
    EXCLUDE USING gist (
        coach_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status IN ('held','booked'))
);

CREATE INDEX idx_slots_coach_time ON slots(coach_id, starts_at);
CREATE INDEX idx_slots_open ON slots(coach_id, starts_at) WHERE status = 'open';
CREATE INDEX idx_slots_facility ON slots(facility_id);

-- ============================================================
-- RLS HELPER  (coach_ids the current parent is connected to)
-- ============================================================
CREATE OR REPLACE FUNCTION my_connected_coach_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coach_id FROM coach_connections WHERE parent_user_id = auth.uid()
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- session_types: coach manages own; connected parents read active ones.
-- (Public-listing reads happen through an RPC in a later PR, not direct table access.)
ALTER TABLE session_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session types read by coach or connected parent"
    ON session_types FOR SELECT
    USING (
        coach_id = my_coach_id()
        OR (is_active AND coach_id IN (SELECT my_connected_coach_ids()))
    );

CREATE POLICY "Session types insert by coach"
    ON session_types FOR INSERT
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Session types update by coach"
    ON session_types FOR UPDATE
    USING (coach_id = my_coach_id())
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Session types delete by coach"
    ON session_types FOR DELETE
    USING (coach_id = my_coach_id());

-- availability_rules: coach-internal scheduling config — coach only.
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability rules managed by coach"
    ON availability_rules FOR ALL
    USING (coach_id = my_coach_id())
    WITH CHECK (coach_id = my_coach_id());

-- slots: coach manages own; a connected parent sees OPEN slots shared to them.
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slots read by coach or eligible parent"
    ON slots FOR SELECT
    USING (
        coach_id = my_coach_id()
        OR (
            status = 'open' AND (
                (visibility = 'all' AND coach_id IN (SELECT my_connected_coach_ids()))
                OR (
                    visibility = 'individual'
                    AND shared_with_connection_id IN (
                        SELECT id FROM coach_connections WHERE parent_user_id = auth.uid()
                    )
                )
            )
        )
    );

CREATE POLICY "Slots insert by coach"
    ON slots FOR INSERT
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Slots update by coach"
    ON slots FOR UPDATE
    USING (coach_id = my_coach_id())
    WITH CHECK (coach_id = my_coach_id());

CREATE POLICY "Slots delete by coach"
    ON slots FOR DELETE
    USING (coach_id = my_coach_id());

-- ============================================================
-- UPDATED_AT TRIGGERS  (reuse update_updated_at() from 00001)
-- ============================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON session_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON availability_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================== 00056_coaching_bookings_payments.sql =====================
-- ============================================================
-- Coaching & Lessons Module — Bookings + payments tables (PR 3a)
-- booking_requests, bookings, payment_events
-- See docs/coaching-build-spec.md §2.3 and docs/coaching-payments-tech.md
--
-- SECURITY MODEL: these tables have READ-only RLS. Every state mutation goes
-- through the SECURITY DEFINER RPCs in 00057 (request/accept/decline/cancel) or
-- the Stripe edge functions (service role). There are intentionally NO direct
-- INSERT/UPDATE/DELETE policies — clients cannot write booking state by hand.
-- ============================================================

-- ============================================================
-- BOOKING REQUESTS  (the request-to-book record; payment authorized, not captured)
-- ============================================================
CREATE TABLE booking_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id               UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id             UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    session_type_id        UUID NOT NULL REFERENCES session_types(id),
    slot_id                UUID NOT NULL REFERENCES slots(id),
    notes                  TEXT,                  -- what to work on
    film_links             TEXT[] NOT NULL DEFAULT '{}',
    status                 TEXT NOT NULL DEFAULT 'requested'
                             CHECK (status IN ('requested','accepted','declined','expired','cancelled')),
    accepted_terms_version TEXT NOT NULL,
    payment_intent_id      TEXT,                  -- Stripe PI (manual capture); set by edge fn
    expires_at             TIMESTAMPTZ NOT NULL,  -- coach response window
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_requests_coach_status ON booking_requests(coach_id, status);
CREATE INDEX idx_booking_requests_parent ON booking_requests(parent_user_id);
CREATE INDEX idx_booking_requests_expiry ON booking_requests(expires_at) WHERE status = 'requested';

-- ============================================================
-- BOOKINGS  (confirmed request)
-- ============================================================
CREATE TABLE bookings (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id         UUID NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
    coach_id           UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id         UUID NOT NULL REFERENCES athletes(id),
    slot_id            UUID NOT NULL REFERENCES slots(id),
    price_cents        INT NOT NULL,
    service_fee_cents  INT NOT NULL DEFAULT 0,   -- surcharge line shown to parent
    platform_fee_cents INT NOT NULL DEFAULT 0,   -- RallyHUB take-rate (application_fee_amount)
    payment_method     TEXT,                     -- 'card'|'apple_pay'|'google_pay'|'ach'
    payment_status     TEXT NOT NULL DEFAULT 'pending'
                         CHECK (payment_status IN ('pending','authorized','captured','refunded','failed')),
    stripe_charge_id   TEXT,
    reminder_sent_24h  BOOLEAN NOT NULL DEFAULT false,
    reminder_sent_2h   BOOLEAN NOT NULL DEFAULT false,
    status             TEXT NOT NULL DEFAULT 'confirmed'
                         CHECK (status IN ('confirmed','completed','cancelled','no_show')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_coach ON bookings(coach_id);
CREATE INDEX idx_bookings_parent ON bookings(parent_user_id);
-- Reminder sweep: confirmed bookings whose slot is upcoming and not yet reminded.
CREATE INDEX idx_bookings_reminders ON bookings(slot_id)
    WHERE status = 'confirmed' AND (reminder_sent_24h = false OR reminder_sent_2h = false);

-- ============================================================
-- PAYMENT EVENTS  (append-only audit of Stripe webhooks + refunds; webhook idempotency)
-- ============================================================
CREATE TABLE payment_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    request_id      UUID REFERENCES booking_requests(id) ON DELETE SET NULL,
    type            TEXT NOT NULL,    -- 'authorized'|'captured'|'refunded'|'ach_returned'|'payout'|'dispute'...
    amount_cents    INT,
    stripe_event_id TEXT UNIQUE,      -- duplicate webhook delivery => unique-violation no-op
    raw             JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_booking ON payment_events(booking_id);
CREATE INDEX idx_payment_events_request ON payment_events(request_id);

-- ============================================================
-- RLS  (READ-only for clients; all writes via RPCs / service role)
-- ============================================================
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requests read by parent or coach"
    ON booking_requests FOR SELECT
    USING (parent_user_id = auth.uid() OR coach_id = my_coach_id());

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bookings read by parent or coach"
    ON bookings FOR SELECT
    USING (parent_user_id = auth.uid() OR coach_id = my_coach_id());

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payment events read by involved parties"
    ON payment_events FOR SELECT
    USING (
        booking_id IN (
            SELECT id FROM bookings
            WHERE parent_user_id = auth.uid() OR coach_id = my_coach_id()
        )
        OR request_id IN (
            SELECT id FROM booking_requests
            WHERE parent_user_id = auth.uid() OR coach_id = my_coach_id()
        )
    );

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON booking_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================== 00057_coaching_booking_rpcs.sql =====================
-- ============================================================
-- Coaching & Lessons Module — Server-authoritative booking RPCs (PR 3b)
-- request_booking / accept_booking_request / decline_booking_request /
-- cancel_booking / expire_booking_requests / get_coach_request_detail
-- See docs/coaching-build-spec.md §2.4
--
-- These own every booking state transition. Clients never write booking/slot
-- state directly (00056 has read-only RLS). Stripe money moves are layered on
-- top by edge functions (authorize after request, capture after accept, etc.).
-- ============================================================

-- ------------------------------------------------------------
-- request_booking: parent reserves a slot. Locks the slot row, enforces
-- availability, forms the coach<->parent connection, creates the request.
-- Returns the request so the edge fn can create the PaymentIntent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_booking(
    p_slot_id         UUID,
    p_session_type_id UUID,
    p_athlete_id      UUID,
    p_terms_version   TEXT,
    p_notes           TEXT DEFAULT NULL,
    p_film_links      TEXT[] DEFAULT '{}',
    p_response_hours  INT DEFAULT 48
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent     UUID := auth.uid();
    v_slot       slots%ROWTYPE;
    v_stype      session_types%ROWTYPE;
    v_request_id UUID;
BEGIN
    IF v_parent IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    -- Athlete must belong to the caller.
    IF p_athlete_id NOT IN (SELECT my_athlete_ids()) THEN
        RAISE EXCEPTION 'athlete % is not accessible to this user', p_athlete_id;
    END IF;

    -- Lock the slot to serialize concurrent requests on the last seat.
    SELECT * INTO v_slot FROM slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot not found';
    END IF;
    IF v_slot.status <> 'open' OR v_slot.seats_taken >= v_slot.seats_total THEN
        RAISE EXCEPTION 'slot unavailable';
    END IF;

    -- Session type must belong to the same coach as the slot.
    SELECT * INTO v_stype FROM session_types WHERE id = p_session_type_id;
    IF NOT FOUND OR v_stype.coach_id <> v_slot.coach_id OR NOT v_stype.is_active THEN
        RAISE EXCEPTION 'invalid session type for this slot';
    END IF;

    -- Reserve the seat. Mark slot 'held' once full (single-seat in v1 => held now).
    UPDATE slots
       SET seats_taken = seats_taken + 1,
           status = CASE WHEN seats_taken + 1 >= seats_total THEN 'held' ELSE status END
     WHERE id = p_slot_id;

    -- Form the roster connection if it doesn't exist yet (spec §7.5).
    INSERT INTO coach_connections (coach_id, parent_user_id, athlete_id, status)
    VALUES (v_slot.coach_id, v_parent, p_athlete_id, 'active')
    ON CONFLICT (coach_id, parent_user_id) DO NOTHING;

    INSERT INTO booking_requests (
        coach_id, parent_user_id, athlete_id, session_type_id, slot_id,
        notes, film_links, accepted_terms_version, expires_at
    )
    VALUES (
        v_slot.coach_id, v_parent, p_athlete_id, p_session_type_id, p_slot_id,
        p_notes, COALESCE(p_film_links, '{}'),
        p_terms_version, now() + make_interval(hours => p_response_hours)
    )
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'request_id', v_request_id,
        'coach_id', v_slot.coach_id,
        'price_cents', v_stype.price_cents,
        'booking_mode', v_stype.booking_mode,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- accept_booking_request: coach accepts. Books the slot, creates the booking.
-- Edge fn (capture-booking-intent) then captures the PaymentIntent and fills fees.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_booking_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req        booking_requests%ROWTYPE;
    v_price      INT;
    v_booking_id UUID;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    -- Owning coach must accept. The service role (auth.uid() IS NULL) is the trusted
    -- exception: the capture edge fn auto-accepts instant-book requests this way.
    IF auth.uid() IS NOT NULL AND v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;
    IF v_req.status <> 'requested' THEN
        RAISE EXCEPTION 'request is % (expected requested)', v_req.status;
    END IF;

    SELECT price_cents INTO v_price FROM session_types WHERE id = v_req.session_type_id;

    UPDATE booking_requests SET status = 'accepted' WHERE id = p_request_id;
    UPDATE slots SET status = 'booked' WHERE id = v_req.slot_id;

    INSERT INTO bookings (
        request_id, coach_id, parent_user_id, athlete_id, slot_id,
        price_cents, payment_status, status
    )
    VALUES (
        v_req.id, v_req.coach_id, v_req.parent_user_id, v_req.athlete_id, v_req.slot_id,
        v_price, 'authorized', 'confirmed'
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'payment_intent_id', v_req.payment_intent_id,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- decline_booking_request: coach declines (or system marks expired). Releases the slot.
-- Edge fn (release-booking-intent) then cancels the PaymentIntent authorization.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_booking_request(
    p_request_id UUID,
    p_reason     TEXT DEFAULT 'declined'   -- 'declined' | 'expired'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req booking_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    -- Coach may decline; the expiry sweep passes p_reason='expired' as definer.
    IF p_reason = 'declined' AND v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;
    IF v_req.status <> 'requested' THEN
        RAISE EXCEPTION 'request is % (expected requested)', v_req.status;
    END IF;

    UPDATE booking_requests
       SET status = CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'declined' END
     WHERE id = p_request_id;

    -- Release the held seat.
    UPDATE slots
       SET seats_taken = GREATEST(seats_taken - 1, 0),
           status = CASE WHEN status = 'held' THEN 'open' ELSE status END
     WHERE id = v_req.slot_id;

    RETURN jsonb_build_object(
        'request_id', v_req.id,
        'payment_intent_id', v_req.payment_intent_id,
        'status', CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'declined' END,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- cancel_booking: parent or coach cancels a confirmed booking. Releases the slot.
-- Edge fn (refund-booking) computes + issues the refund per cancellation policy.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk    bookings%ROWTYPE;
    v_actor TEXT;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking not found';
    END IF;

    IF v_bk.coach_id = my_coach_id() THEN
        v_actor := 'coach';
    ELSIF v_bk.parent_user_id = auth.uid() THEN
        v_actor := 'parent';
    ELSE
        RAISE EXCEPTION 'not authorized to cancel this booking';
    END IF;

    IF v_bk.status <> 'confirmed' THEN
        RAISE EXCEPTION 'booking is % (expected confirmed)', v_bk.status;
    END IF;

    UPDATE bookings SET status = 'cancelled' WHERE id = p_booking_id;
    UPDATE booking_requests SET status = 'cancelled' WHERE id = v_bk.request_id;

    -- Free the slot back to open.
    UPDATE slots
       SET seats_taken = GREATEST(seats_taken - 1, 0),
           status = 'open'
     WHERE id = v_bk.slot_id;

    RETURN jsonb_build_object(
        'booking_id', v_bk.id,
        'cancelled_by', v_actor,
        'stripe_charge_id', v_bk.stripe_charge_id,
        'payment_status', v_bk.payment_status,
        'success', true
    );
END;
$$;

-- ------------------------------------------------------------
-- expire_booking_requests: cron sweep. Expires overdue requests, releases slots,
-- returns the expired set (with PI ids) so the caller releases authorizations.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_booking_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired JSONB;
BEGIN
    WITH due AS (
        SELECT id, slot_id, payment_intent_id
        FROM booking_requests
        WHERE status = 'requested' AND expires_at < now()
        FOR UPDATE SKIP LOCKED
    ),
    upd_req AS (
        UPDATE booking_requests br SET status = 'expired'
        FROM due WHERE br.id = due.id
        RETURNING br.id, br.payment_intent_id
    ),
    upd_slot AS (
        UPDATE slots s
           SET seats_taken = GREATEST(s.seats_taken - 1, 0),
               status = CASE WHEN s.status = 'held' THEN 'open' ELSE s.status END
        FROM due WHERE s.id = due.slot_id
        RETURNING s.id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'request_id', id, 'payment_intent_id', payment_intent_id)), '[]'::jsonb)
      INTO v_expired
      FROM upd_req;

    RETURN jsonb_build_object('expired', v_expired, 'success', true);
END;
$$;

-- ------------------------------------------------------------
-- get_coach_request_detail: owning coach reads the athlete profile + notes + film
-- for a request. This is the data-minimization boundary (spec §7.12) — the coach
-- has no direct read grant on athletes; profile fields flow only through here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_request_detail(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req booking_requests%ROWTYPE;
    v_out JSONB;
BEGIN
    SELECT * INTO v_req FROM booking_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found';
    END IF;
    IF v_req.coach_id <> my_coach_id() THEN
        RAISE EXCEPTION 'not your request';
    END IF;

    SELECT jsonb_build_object(
        'request_id', v_req.id,
        'status', v_req.status,
        'notes', v_req.notes,
        'film_links', v_req.film_links,
        'athlete', jsonb_build_object(
            'first_name', a.first_name,
            'last_name', a.last_name,
            'grad_year', a.grad_year,
            'positions', a.positions,
            'level', a.level,
            'club_team', a.club_team,
            'height_inches', a.height_inches,
            'goals', a.goals
        )
    ) INTO v_out
    FROM athletes a WHERE a.id = v_req.athlete_id;

    RETURN v_out;
END;
$$;

-- Grants: authenticated callers; authorization is enforced inside each function.
GRANT EXECUTE ON FUNCTION request_booking(UUID, UUID, UUID, TEXT, TEXT, TEXT[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_booking_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_booking_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_coach_request_detail(UUID) TO authenticated;
-- expire_booking_requests is called by the scheduled job via service role only.

-- ===================== 00058_coaching_notification_prefs.sql =====================
-- ============================================================
-- Coaching & Lessons Module — Notification preferences (PR 3c)
-- Per-user SMS/push prefs for coaching events, independent of the season
-- notification block on admin_config. Reuses send-notification + notification_log.
-- See docs/coaching-build-spec.md §2.5 / §7.9
-- ============================================================
CREATE TABLE coaching_notification_prefs (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    sms_enabled  BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coaching_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own coaching notification prefs"
    ON coaching_notification_prefs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON coaching_notification_prefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================== 00059_coach_photos_bucket.sql =====================
-- ============================================================
-- Coaching & Lessons Module — coach profile photo storage (PR 4b)
-- Public-read bucket; each coach can write only under their own auth.uid() folder.
-- Path convention: coach-photos/<auth.uid()>/<filename>
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('coach-photos', 'coach-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (it's a public bucket; profile photos are shown on listings).
CREATE POLICY "Public read coach photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'coach-photos');

-- A user may write only within their own uid-prefixed folder.
CREATE POLICY "Coaches upload own photo"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Coaches update own photo"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Coaches delete own photo"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
