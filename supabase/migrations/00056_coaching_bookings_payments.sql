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
