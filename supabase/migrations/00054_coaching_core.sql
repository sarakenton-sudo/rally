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
