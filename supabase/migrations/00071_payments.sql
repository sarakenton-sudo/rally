-- ============================================================
-- Coach Experience — Phase C: payments (Stripe Connect)
--
-- Model (replaces the June manual-capture-at-request draft):
--   * Coach connects a Stripe Express account (stripe-connect-onboard).
--   * Parent saves a payment method once via Stripe Checkout (setup mode):
--     card / Apple Pay / Google Pay / ACH  → stripe_customers.
--   * Each confirmed booking gets charge_due_at from the coach's timing
--     (on accept [default] / N hours before / after the lesson). A scheduled
--     job (charge-due-bookings) charges it off-session as a destination
--     charge; RallyHUB keeps an application fee.
--   * Take rate is an admin setting (platform_settings.platform_fee_bps).
--   * Coach chooses fee handling: absorb Stripe's fee, or pass it to the
--     parent as a service fee ('surcharge').
-- ============================================================

-- ---- Admin-editable platform settings (single row) ----
CREATE TABLE IF NOT EXISTS platform_settings (
    id               BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    platform_fee_bps INT NOT NULL DEFAULT 1000 CHECK (platform_fee_bps BETWEEN 0 AND 5000),  -- 1000 = 10%
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform settings readable" ON platform_settings;
CREATE POLICY "Platform settings readable" ON platform_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Platform settings admin update" ON platform_settings;
CREATE POLICY "Platform settings admin update" ON platform_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- ---- Coach payment settings + Stripe status ----
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS payment_timing TEXT NOT NULL DEFAULT 'on_accept';
ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_payment_timing_check;
ALTER TABLE coaches ADD CONSTRAINT coaches_payment_timing_check
    CHECK (payment_timing IN ('on_accept', 'hours_before', 'after_lesson'));
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS payment_hours_before     INT NOT NULL DEFAULT 24 CHECK (payment_hours_before BETWEEN 1 AND 168);
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_charges_enabled   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_payouts_enabled   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION set_my_payment_settings(p_timing TEXT, p_hours_before INT, p_fee_handling TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE coaches
       SET payment_timing = p_timing,
           payment_hours_before = COALESCE(p_hours_before, payment_hours_before),
           fee_handling = p_fee_handling
     WHERE id = my_coach_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'not a coach'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION set_my_payment_settings(TEXT, INT, TEXT) TO authenticated;

-- ---- Parent's saved payment method (one default per parent) ----
CREATE TABLE IF NOT EXISTS stripe_customers (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    payment_method_id  TEXT,
    pm_type            TEXT,          -- 'card' | 'us_bank_account'
    pm_brand           TEXT,          -- 'visa', 'apple_pay', bank name…
    pm_last4           TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Parents read own payment method" ON stripe_customers;
CREATE POLICY "Parents read own payment method" ON stripe_customers FOR SELECT USING (user_id = auth.uid());
-- Writes: edge functions (service role) only.

-- ---- Booking charge tracking ----
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'authorized', 'processing', 'captured', 'refunded', 'failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS charge_due_at            TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_charged_cents     INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_cents           INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS charge_attempts          INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_charge_error        TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_charge_due
    ON bookings(charge_due_at) WHERE payment_status IN ('pending', 'failed') AND status = 'confirmed';

-- When a booking is created or moved, schedule its charge from the coach's timing.
CREATE OR REPLACE FUNCTION schedule_booking_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach coaches%ROWTYPE;
    v_slot  slots%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.slot_id = OLD.slot_id OR NEW.payment_status NOT IN ('pending', 'failed')) THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_coach FROM coaches WHERE id = NEW.coach_id;
    SELECT * INTO v_slot  FROM slots   WHERE id = NEW.slot_id;
    IF TG_OP = 'INSERT' THEN
        -- The old flow marked new bookings 'authorized' (card hold). Now nothing
        -- is collected until the scheduled charge runs.
        IF NEW.payment_status = 'authorized' THEN NEW.payment_status := 'pending'; END IF;
    END IF;
    NEW.charge_due_at := CASE v_coach.payment_timing
        WHEN 'hours_before' THEN GREATEST(now(), v_slot.starts_at - make_interval(hours => v_coach.payment_hours_before))
        WHEN 'after_lesson' THEN v_slot.ends_at + interval '2 hours'
        ELSE now()
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_schedule_charge ON bookings;
CREATE TRIGGER bookings_schedule_charge
    BEFORE INSERT OR UPDATE OF slot_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION schedule_booking_charge();

-- Current take rate, for showing fee previews in the app.
CREATE OR REPLACE FUNCTION get_platform_fee_bps()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT platform_fee_bps FROM platform_settings WHERE id; $$;
GRANT EXECUTE ON FUNCTION get_platform_fee_bps() TO anon, authenticated;

-- Offline "mark paid" can't override an in-app charge that's processing (ACH).
CREATE OR REPLACE FUNCTION mark_booking_paid(p_booking_id UUID, p_method TEXT DEFAULT 'cash', p_amount_cents INT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bk bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_bk FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_bk.coach_id IS DISTINCT FROM my_coach_id() THEN
        RAISE EXCEPTION 'not your booking';
    END IF;
    IF p_method NOT IN ('cash', 'venmo', 'zelle', 'other') THEN
        RAISE EXCEPTION 'unsupported payment method %', p_method;
    END IF;
    IF v_bk.stripe_charge_id IS NOT NULL OR v_bk.payment_status = 'processing' THEN
        RAISE EXCEPTION 'this lesson is already being paid through RallyHUB';
    END IF;

    UPDATE bookings
       SET payment_status = 'captured',
           payment_method = p_method,
           paid_at = now(),
           paid_amount_cents = COALESCE(p_amount_cents, v_bk.price_cents),
           charge_due_at = NULL   -- stop the scheduled in-app charge
     WHERE id = p_booking_id;

    INSERT INTO payment_events (booking_id, request_id, type, amount_cents, raw)
    VALUES (v_bk.id, v_bk.request_id, 'offline_recorded', COALESCE(p_amount_cents, v_bk.price_cents),
            jsonb_build_object('method', p_method));
END;
$$;
