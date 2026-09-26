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
