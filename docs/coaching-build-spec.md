# RallyHUB — Coaching & Lessons Module · Phased Build Spec

**Source PRD:** Coaching & Lessons Module v1.2
**Target stack:** Expo (React Native + expo-router + NativeWind) · Supabase (Postgres + Auth + Edge Functions) · Zustand · Vite admin app · Stripe Connect (new)
**Status:** Engineering spec — maps the PRD onto the existing RallyHUB codebase and sequences it into shippable PRs.

> This is the doc you build from. Every table, route, function, and PR below is written to match the conventions already in `/Users/sarakenton/rally`. Where the PRD leaves a decision open (§10 of the PRD), this spec picks a **build default** so work isn't blocked, and flags it as a reversible assumption.

---

## 0. How this maps onto the existing app (read first)

| PRD concept | Existing RallyHUB reality | What we build |
|---|---|---|
| "Parent/Guardian" | The existing `admin` user (`user_profiles.role = 'admin'`). Already the power user. | **No new persona** — extend the admin user with a "My Coaches" surface. |
| "Athlete" + AthleteProfile | `athletes` table exists (`first_name`, `last_name`, `avatar_color`, linked via `admin_athletes`). | **Extend** `athletes` with a profile (grad year, position, level, goals…) rather than a new table. |
| "Coach" (new persona) | No coach role exists. Roles are `'admin' | 'athlete'`. | **New role** `'coach'` + new `coaches` listing table. A user can be both (dual role). |
| "Listing" (public/private) | Nothing analogous. Closest pattern: the public, logged-out **guest web view** (`app/guest/`) and `app/landing.tsx`, served via Expo web export on Vercel. | Public coach profile = a logged-out **Expo Router web route** reusing the guest-view pattern. |
| Payments / take-rate | **None.** `cost`/`price` fields are display-only (hotels, flights, tickets). No Stripe anywhere. | **Greenfield Stripe Connect** integration (edge functions + webhooks). |
| Reminders (24h/2h) | `send-notification` edge fn (Twilio SMS + Expo push) + `notification_log` table exist. **No cron/scheduler exists.** | Reuse `send-notification`; add a **scheduled reminder runner** (external cron → edge fn). |
| Coach earnings / operator views | Admin web app (`admin/`, Vite + react-router + tanstack-table + RPC pattern). | Add coach-facing earnings to mobile (basic) + operator GBV/take-rate views to `admin/`. |

**Conventions this spec follows (verified in-repo):**
- Migrations: `supabase/migrations/000NN_*.sql`, sequential. **Next free number: `00054`.**
- Every table: `id UUID PK DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at` with `CREATE TRIGGER set_updated_at BEFORE UPDATE … EXECUTE FUNCTION update_updated_at()`.
- RLS on every table. Ownership policies use `auth.uid() = <owner>_user_id`. Public/anon writes go through a `SECURITY DEFINER` RPC (the `submit_lead` pattern in `00052_leads.sql`).
- Types live in `types/database.ts` as an interface + a `Database.public.Tables` entry with `Row` / `Insert` / `Update`.
- Screens: expo-router files, NativeWind `className` only, `FormField` / `DropdownField` / `DatePickerField`, `SafeAreaView` with `edges`, `router.push/back`, `showAlert()` wrapper.
- Edge functions: Deno, `serve()`, service-role client, CORS preamble, deploy via `npx supabase functions deploy <name> --project-ref dtoolzolnxfjlivwyblv`.

---

## 1. Architectural decisions (the load-bearing ones)

These shape everything downstream. Build defaults chosen; all reversible.

1. **Coaching data is NOT season-scoped.** It lives in its own ownership graph (`coach_user_id` / `parent` account), deliberately independent of `seasons`/`teams`. Do **not** route it through `my_season_ids()`. New RLS helpers: `is_coach()`, `my_coach_id()`.
2. **One Supabase project, new tables, new role.** Add `'coach'` to the `UserRole` union and a `coaches` row keyed by `auth.users`. A user can hold `coaches` (coach side) and `admin_athletes` (parent side) simultaneously — the dual-role toggle is a client view switch, not separate accounts.
3. **Stripe Connect (Express accounts), destination charges with `application_fee_amount`.** RallyHUB is the platform/merchant-of-record-adjacent; each coach is a connected Express account (Stripe handles KYC/1099-K). This is the standard marketplace topology and the lowest-compliance-burden path. **(Legal sign-off still required on MoR + waiver — PRD §10.10.)**
4. **Request-to-book is the default; payment is authorized then captured on accept.** Implement via Stripe PaymentIntent with `capture_method: 'manual'`. Instant-book = same intent captured immediately. This single mechanism covers both PRD flows.
5. **The public coach profile is a web-first, logged-out route** rendered by Expo Router web export (same Vercel deploy as today). It is the acquisition surface; the app is the upsell. No new web framework.
6. **Reminders need a scheduler we don't have yet.** Add one `send-lesson-reminders` edge function invoked by an external cron (GitHub Actions scheduled workflow, every 15 min) — cheapest reliable option, no `pg_cron` add-on needed. Idempotent via a `reminder_sent_24h` / `reminder_sent_2h` flag on the booking.

---

## 2. Data model

All migrations below are **new files** starting at `00054`. SQL is abbreviated to the load-bearing columns + the RLS shape; flesh out per the in-repo style (`00050_tournament_tickets.sql` is the cleanest reference).

### 2.1 `00054_coaching_core.sql` — coaches, athlete profiles, connections

```sql
-- user_profiles.role is a real Postgres ENUM: CREATE TYPE user_role AS ENUM ('admin','athlete') (00009:13).
-- Adding 'coach' must be its OWN statement, committed before any migration USES the value:
--   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coach';
-- ADD VALUE cannot run in the same txn that then references it — put it FIRST in 00054
-- (or its own 00054a migration) so PRs that insert role='coach' run in a later migration/txn.

-- COACHES (the "listing")
CREATE TABLE coaches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name        TEXT NOT NULL,
    photo_url           TEXT,
    bio                 TEXT,
    specialties         TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {setting,defense,recruiting}
    sport               TEXT NOT NULL DEFAULT 'volleyball',
    certifications      JSONB NOT NULL DEFAULT '[]',     -- [{label, number, status}]
    safesport_status    TEXT,                            -- 'verified' | 'self_attested' | null
    identity_verified   BOOLEAN NOT NULL DEFAULT false,  -- mirrors Stripe Connect KYC
    facilities          JSONB NOT NULL DEFAULT '[]',     -- [{label,address,lat,lng}] (reuse Venue shape)
    default_timezone    TEXT NOT NULL DEFAULT 'America/Chicago',
    visibility          TEXT NOT NULL DEFAULT 'private'  -- 'public' | 'private'
                          CHECK (visibility IN ('public','private')),
    invite_code         TEXT UNIQUE,                     -- for private invite-gating
    cost_tier           TEXT CHECK (cost_tier IN ('$','$$','$$$')),
    fee_handling        TEXT NOT NULL DEFAULT 'absorb'   -- 'absorb' | 'surcharge'
                          CHECK (fee_handling IN ('absorb','surcharge')),
    instant_book_default BOOLEAN NOT NULL DEFAULT false,
    cancellation_policy_version TEXT NOT NULL DEFAULT 'v1-standard',
    slug                TEXT UNIQUE,                     -- public profile URL: /coach/[slug]
    stripe_account_id   TEXT,                            -- Stripe Connect acct (set in §6 migration)
    onboarding_complete BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coaches_visibility ON coaches(visibility) WHERE visibility = 'public';
CREATE UNIQUE INDEX idx_coaches_slug ON coaches(slug);

-- ATHLETE PROFILE  (extend existing athletes, don't fork it)
ALTER TABLE athletes
    ADD COLUMN grad_year      INT,
    ADD COLUMN positions      TEXT[] DEFAULT '{}',
    ADD COLUMN level          TEXT,        -- 'recreational'|'regional'|'national'|... (free-ish, coach-judged)
    ADD COLUMN club_team      TEXT,
    ADD COLUMN height_inches  INT,
    ADD COLUMN goals          TEXT;

-- COACH CONNECTION (the roster) — links a coach to a parent account (+ optionally an athlete)
CREATE TABLE coach_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'active'  -- 'invited' | 'active'
                      CHECK (status IN ('invited','active')),
    invited_email   TEXT,                            -- for invite-a-new-family
    invited_phone   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, parent_user_id)
);
CREATE INDEX idx_coach_connections_coach  ON coach_connections(coach_id);
CREATE INDEX idx_coach_connections_parent ON coach_connections(parent_user_id);
```

**RLS shape (this table set):**
- `coaches`: `SELECT` allowed when `visibility='public'` **OR** `user_id = auth.uid()` **OR** the requester holds a `coach_connections` row to this coach. `INSERT/UPDATE/DELETE`: `user_id = auth.uid()`.
- **Public web read** of a public listing happens logged-out → expose a `SECURITY DEFINER` RPC `get_public_coach(slug)` (mirrors the `submit_lead` anon pattern) returning only the listing-safe fields (no `stripe_account_id`, no roster).
- `athletes` new columns inherit existing athlete RLS. A coach reads athlete-profile fields **only** through the booking-request join (data minimization, PRD §7.12) — enforced by a dedicated RPC, not a broad table grant.
- `coach_connections`: visible to the coach (`coach_id` owned) and to the parent (`parent_user_id = auth.uid()`).

### 2.2 `00055_coaching_sessions_availability.sql` — what & when

```sql
CREATE TABLE session_types (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id      UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('private_1','semi_2','small_group','clinic','camp')),
    name          TEXT NOT NULL,
    description   TEXT,
    location_label TEXT,
    price_cents   INT NOT NULL,
    duration_min  INT NOT NULL,
    capacity      INT NOT NULL DEFAULT 1,     -- v1 enforces 1 / 2 only; 3+ is Phase 2
    eligible_min_level TEXT,                   -- optional gate, advisory in v1
    booking_mode  TEXT NOT NULL DEFAULT 'request'  -- 'request' | 'instant'
                    CHECK (booking_mode IN ('request','instant')),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_types_coach ON session_types(coach_id);

-- Recurring rules + materialized one-off/blocked slots
CREATE TABLE availability_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id      UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    weekday       INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- recurring weekly
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    timezone      TEXT NOT NULL,
    visibility    TEXT NOT NULL DEFAULT 'all'  -- 'all' | 'individual'  ('group' = Phase 2)
                    CHECK (visibility IN ('all','individual')),
    shared_with_connection_id UUID REFERENCES coach_connections(id) ON DELETE CASCADE,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE slots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id      UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    session_type_id UUID REFERENCES session_types(id) ON DELETE SET NULL,
    starts_at     TIMESTAMPTZ NOT NULL,
    ends_at       TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open'   -- 'open'|'held'|'booked'|'blocked'
                    CHECK (status IN ('open','held','booked','blocked')),
    seats_total   INT NOT NULL DEFAULT 1,
    seats_taken   INT NOT NULL DEFAULT 0,
    visibility    TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','individual')),
    shared_with_connection_id UUID REFERENCES coach_connections(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- prevent the same coach from double-booking overlapping confirmed slots
    EXCLUDE USING gist (
      coach_id WITH =,
      tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status IN ('held','booked'))
);
CREATE INDEX idx_slots_coach_time ON slots(coach_id, starts_at);
```

> The `EXCLUDE USING gist` constraint (needs `btree_gist`) is the **transaction-safe double-booking guard** the PRD calls for (§7.4, §7.12 last-seat race). Seat decrement on the final small-group seat (Phase 2) uses `UPDATE … WHERE seats_taken < seats_total` inside the booking RPC.

### 2.3 `00056_coaching_bookings_payments.sql` — requests, bookings, money

```sql
CREATE TABLE booking_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id      UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    session_type_id UUID NOT NULL REFERENCES session_types(id),
    slot_id         UUID NOT NULL REFERENCES slots(id),
    notes           TEXT,                 -- what to work on
    film_links      TEXT[] DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested','accepted','declined','expired','cancelled')),
    accepted_terms_version TEXT NOT NULL,
    payment_intent_id TEXT,               -- Stripe PI (manual capture)
    expires_at      TIMESTAMPTZ NOT NULL, -- auto-expire window for coach response
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_requests_coach_status ON booking_requests(coach_id, status);
CREATE INDEX idx_booking_requests_parent ON booking_requests(parent_user_id);

CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    parent_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id      UUID NOT NULL REFERENCES athletes(id),
    slot_id         UUID NOT NULL REFERENCES slots(id),
    price_cents     INT NOT NULL,
    service_fee_cents INT NOT NULL DEFAULT 0,   -- surcharge line shown to parent
    platform_fee_cents INT NOT NULL DEFAULT 0,  -- RallyHUB take-rate (application_fee_amount)
    payment_method  TEXT NOT NULL,              -- 'card'|'apple_pay'|'google_pay'|'ach'
    payment_status  TEXT NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','authorized','captured','refunded','failed')),
    stripe_charge_id TEXT,
    reminder_sent_24h BOOLEAN NOT NULL DEFAULT false,
    reminder_sent_2h  BOOLEAN NOT NULL DEFAULT false,
    status          TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed','completed','cancelled','no_show')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_coach ON bookings(coach_id);
CREATE INDEX idx_bookings_parent ON bookings(parent_user_id);
CREATE INDEX idx_bookings_reminders ON bookings(slot_id) WHERE status = 'confirmed';

CREATE TABLE payment_events (   -- append-only audit of Stripe webhook events + refunds
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    request_id      UUID REFERENCES booking_requests(id) ON DELETE SET NULL,
    type            TEXT NOT NULL,    -- 'authorized'|'captured'|'refunded'|'ach_returned'|'payout'...
    amount_cents    INT,
    stripe_event_id TEXT UNIQUE,      -- webhook idempotency
    raw             JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 `00057_coaching_rpcs.sql` — server-authoritative booking logic

The booking lifecycle **must not** be client-trusted. Wrap the state transitions in `SECURITY DEFINER` RPCs (same pattern as `submit_lead`, the onboarding RPCs in `00010`–`00015`):

- `request_booking(slot_id, session_type_id, athlete_id, notes, film_links, terms_version)` → validates slot is open/eligible, places a `held` on the slot inside a transaction (the `EXCLUDE` constraint enforces no double-book), creates `booking_requests` row, returns it. Payment intent is created by the **edge function** after this RPC (RPC can't call Stripe).
- `accept_booking_request(request_id)` (coach-only) → flips request to `accepted`, marks slot `booked`, creates `bookings` row. Edge function then **captures** the PaymentIntent.
- `decline_booking_request(request_id)` / auto-expiry → releases slot to `open`, edge fn cancels/releases the PI auth.
- `cancel_booking(booking_id, actor)` → applies cancellation policy, releases slot, flags refund for the edge fn.
- `get_coach_request_detail(request_id)` (coach-only) → returns the athlete profile + notes + film **post-eligibility** (data minimization gate lives here).

### 2.5 `00058_coaching_notification_prefs.sql`
Per-user channel prefs for coaching events (reuse the `notification_log` table + `send-notification` fn). Either a new `coaching_notification_prefs` table or extend the existing `notification_preferences` JSON on `admin_config`. **Build default:** small new table keyed by `user_id` with `sms_enabled` / `push_enabled` so coach + parent prefs are independent of the season notification block.

---

## 3. TypeScript types (`types/database.ts`)

Add interfaces mirroring each table, and register them in `Database.public.Tables` with `Row` / `Insert` / `Update` exactly like `tournament_tickets`:

```ts
export type CoachVisibility = 'public' | 'private';
export type FeeHandling = 'absorb' | 'surcharge';
export type SessionKind = 'private_1' | 'semi_2' | 'small_group' | 'clinic' | 'camp';
export type BookingMode = 'request' | 'instant';
export type RequestStatus = 'requested' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed';
// + extend UserRole: 'admin' | 'athlete' | 'coach'

export interface Coach { /* … mirrors 2.1 … */ }
export interface SessionType { /* … */ }
export interface AvailabilityRule { /* … */ }
export interface Slot { /* … */ }
export interface CoachConnection { /* … */ }
export interface BookingRequest { /* … */ }
export interface Booking { /* … */ }
// AthleteProfile fields fold into the existing `Athlete` interface (new optional fields).
```

Register each in `Database.public.Tables` with the `Omit<…,'id'|'created_at'|'updated_at'>` Insert convention. Add the new RPCs under `Database.public.Functions`.

---

## 4. Route map

### Mobile (expo-router, under `app/`)

**Coach side** — gated by `userProfile.role === 'coach'` (or dual-role toggle):
```
app/coach/_layout.tsx
app/coach/index.tsx              # coach dashboard: today's sessions, requests needing action, earnings strip
app/coach/onboarding.tsx         # create listing + Stripe Connect link
app/coach/listing-edit.tsx       # (modal) visibility, cost tier, fee handling, bio, specialties
app/coach/session-types.tsx      # list + add/edit session types
app/coach/session-type-edit.tsx  # (modal) FormField/DropdownField/DatePickerField
app/coach/availability.tsx       # recurring rules + one-off slots + block time
app/coach/requests.tsx           # inbound requests; accept/decline w/ athlete profile + film
app/coach/request/[id].tsx       # request detail (athlete profile, notes, film, accept/decline)
app/coach/roster.tsx             # connections list + invite-a-family
app/coach/earnings.tsx           # basic earnings (v1)
```

**Parent side** — new section in the existing tabbed app:
```
app/coaching/index.tsx           # "My Coaches" list (connected coaches)
app/coaching/coach/[id].tsx      # coach detail (in-app view of a listing) + slots
app/coaching/request.tsx         # (modal) request flow: pick slot → athlete → notes/film → terms → pay
app/coaching/booking/[id].tsx    # booking detail: reschedule/cancel, receipts, film/notes
```

**Navigation wiring:**
- Register the new stack routes in `app/_layout.tsx` (`<Stack.Screen … />`), matching the modal vs full-screen pattern already used for `booking/*` and `tournament/*`.
- Surface "My Coaches" — **recommended placement: a tile/row in the existing Hub/Settings tab** (`app/(tabs)/hub.tsx`) plus a Home-dashboard action item, rather than spending one of the 5 tab slots in v1. (A dedicated tab is a Phase 2 call once usage justifies it.)
- Coach-role users land on `app/coach/index.tsx` after auth; the dual-role toggle (PRD §7.11) lives in the header (mirror `SeasonSwitcher.tsx`).

### Web (public acquisition surface — Expo web export, same Vercel deploy)
```
app/coach/[slug]/public.tsx      # logged-out PUBLIC coach profile (SEO/shareable). Reads via get_public_coach RPC.
                                 # CTA: "Request a session" → account-gate (claim/login) → request flow.
```
Mirror the logged-out guest-view pattern (`app/guest/`) and `app/landing.tsx`. Add the route to `vercel.json` rewrites if needed and ensure `get_public_coach` is callable by `anon`.

---

## 5. State (Zustand)

New store `stores/useCoachStore.ts` (coach-side data) and extend the parent surface either in a `stores/useCoachingStore.ts` or alongside the existing season store — follow the `useSeasonStore` / `useGuestStore` pattern exactly:
- `set*/add*/update*/remove*` actions, selector-based reads, parallel fetch on init via the data provider (`providers/DataProvider.tsx` / `hooks/useSupabaseData.ts`), mock-data fallback when `!isSupabaseConfigured`.
- Coach store: `coachProfile`, `sessionTypes`, `availabilityRules`, `slots`, `connections`, `requests`, `bookings`, `earningsSummary`.
- Parent store: `connectedCoaches`, `myBookings`, `activeRequest`.

---

## 6. Payments — Stripe Connect integration

**New migration `00059_stripe_connect.sql`** (or fold into 2.6) only adds bookkeeping columns already sketched (`coaches.stripe_account_id`, `bookings.stripe_charge_id`, `payment_events`). All Stripe API calls live in **edge functions** (service-role; secret key never touches the client).

**New edge functions** (Deno, `serve()`, CORS preamble, `npx supabase functions deploy <name> --project-ref dtoolzolnxfjlivwyblv`):

| Function | Purpose |
|---|---|
| `stripe-connect-onboard` | Create/refresh a Connect Express account for the coach; return an account link URL. Sets `coaches.stripe_account_id`, mirrors KYC result → `identity_verified`. |
| `create-booking-intent` | After `request_booking` RPC: create a PaymentIntent with `capture_method: 'manual'`, `transfer_data.destination = coach.stripe_account_id`, `application_fee_amount = take-rate`. Card/wallet + ACH (`payment_method_types: ['card','us_bank_account']`). Returns client secret. |
| `capture-booking-intent` | On coach accept: capture the PI. Writes `bookings`, `payment_events`. |
| `release-booking-intent` | On decline/expiry: cancel the PI (releases auth). |
| `refund-booking` | On cancellation per policy: `stripe.refunds.create` (full/partial). ACH refunds route to originating bank. |
| `stripe-webhook` | Single endpoint for `payment_intent.*`, `charge.refunded`, `account.updated`, `payout.*`, **`charge.dispute.created`**, and ACH `payment_intent.payment_failed` (the "ACH return after confirmation" edge case, PRD §7.12). Verifies signature; idempotent on `payment_events.stripe_event_id`. |

**Secrets** (set via `npx supabase secrets set …`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`.

**Fee logic (build default, see §9 decisions):**
- `platform_fee_cents` = take-rate applied as `application_fee_amount`.
- `fee_handling = 'absorb'` → parent pays `price_cents`; coach nets `price_cents − processing − platform_fee`.
- `fee_handling = 'surcharge'` → `service_fee_cents` added to parent total; **card surcharge capped/eligibility-checked per state rules (LEGAL — PRD §10.2)**; ACH surcharge negligible and allowed.
- ACH confirmation: **build default = pending-clear for first-time payers, immediate-confirm for returning** (PRD §10.3). Tracked via `payment_status` (`authorized` vs `captured`) + a `first_time_payer` check on `coach_connections`.

---

## 7. Notifications & reminders

- **Event notifications** (request submitted/accepted/declined, receipt, cancellation, refund, payout, coach new-request): reuse `send-notification` edge fn (Twilio SMS + Expo push) and **log to `notification_log`** with a distinct `notification_type` namespace (`coaching_*`) so admin delivery views (`admin_list_delivery_log()`) pick them up for free. Add coaching templates to `notification_templates` (migration, following `00033`'s seed pattern). Keep coaching alerts visually distinct (PRD §7.9).
- **Scheduled reminders (NEW infra):** add `send-lesson-reminders` edge fn that queries `bookings WHERE status='confirmed' AND starts_at` within the 24h / 2h windows and `reminder_sent_*` = false, sends, then sets the flag (idempotent). Invoke from a **GitHub Actions scheduled workflow** (`.github/workflows/lesson-reminders.yml`, cron every 15 min) hitting the function URL with the service key — no `pg_cron` dependency. Document this as the first scheduled job in the project.

---

## 8. Admin web app (`admin/`)

Add operator visibility for the marketplace metrics the PRD calls "the existential ones":
- New pages under `admin/src/pages/`: `Coaches.tsx` (supply: activated coaches, verified status), `Bookings.tsx` (GBV, take-rate revenue, completion funnel), following the existing `react-router` + `@tanstack/react-table` + `supabase.rpc('admin_list_*')` pattern (`admin/src/lib/queries.ts`).
- New `admin_list_coaches()` / `admin_list_bookings()` / `admin_coaching_metrics()` RPCs (admin-guarded by the `admin_users` check used in `00052_leads.sql`).
- Recharts panel on the dashboard for GBV over time + acquisition-loop counts (new families acquired via a coach — the PRD's primary success metric; track `coach_connections.status='active'` where the parent account was created from a coach link).

---

## 9. Open decisions → build defaults

The PRD's §10 questions, with a default so engineering isn't blocked. Each is reversible (config/column, not architecture). Flag the ⚖️ ones for legal before GA.

| # | Decision | Build default to proceed |
|---|---|---|
| 1 | Take-rate % + itemized vs embedded | `platform_fee_cents` column; **default embedded**, configurable. Start placeholder (e.g. 10%); product to set. |
| 2 | ⚖️ Fee pass-through default + card-surcharge rules | Default `absorb`; surcharge supported but **card surcharge gated by state-rule check** before enabling. |
| 3 | ACH confirm timing | Pending-clear for first-time payers, immediate for returning (column-driven). |
| 4 | Cost display granularity | Show **"from $X"** anchor + optional `$/$$/$$$` tier on public listing; exact per-type prices in-app/after request. |
| 5 | Instant vs request default | **Request** default; `booking_mode` per session type, coach opt-in to instant. |
| 6 | Caliber definition/verification | v1 = **request/approve loop only** (`level` is coach-judged, self-reported). Auto-gating = Phase 2. |
| 7 | Venmo | **Defer.** Lead with ACH + card/wallets in-platform. |
| 8 | ⚖️ SafeSport/background for public listing | **Required to hold a public listing** (verified identity via Connect KYC + displayed SafeSport). Self-attest OK for private/invite. |
| 9 | Discovery surface at launch | **Shareable public profile pages only.** In-app directory/search = Phase 2. |
| 10 | ⚖️ Merchant-of-record + waiver | Stripe Connect (Express) topology; **legal sign-off required** on MoR + minor waiver before GA. |
| 11 | Co-parent booking/refund | Both co-parents can book/manage; refunds to original payment method (matches PRD §7.11 default; reuse existing co-parent RLS from `00048`/`00049`). |

---

## 10. Phased PR sequence (the build order)

Each PR is independently reviewable and, where possible, shippable behind a flag. Phases match PRD §6.

### Phase 0 — Foundation (no user-visible flow yet)
- **PR 1 · Schema: core** — `00054_coaching_core.sql` (coaches, athlete profile fields, connections) + RLS + `types/database.ts`.
- **PR 2 · Schema: sessions/availability** — `00055` (session_types, availability_rules, slots + `btree_gist` exclude) + types.
- **PR 3 · Schema: bookings/payments + RPCs** — `00056` + `00057` (request/accept/decline/cancel RPCs) + `00058` notif prefs + types.

### Phase 1 — Coach can run their business (supply side first — this is the acquisition engine)
- **PR 4 · Coach role + onboarding** — add `'coach'` role; `app/coach/onboarding.tsx`, listing create/edit; `useCoachStore`.
- **PR 5 · Session types + availability UI** — `app/coach/session-types*`, `app/coach/availability.tsx`.
- **PR 6 · Stripe Connect onboarding** — `stripe-connect-onboard` fn + `stripe-webhook` (account.updated) + Connect onboarding link in coach onboarding.
- **PR 7 · Roster + sharing (one client / all clients)** — `app/coach/roster.tsx`, invite-a-family, share-availability targeting.

### Phase 1b — Parent can request, pay, manage (demand side)
- **PR 8 · Public coach profile (web)** — `app/coach/[slug]/public.tsx` + `get_public_coach` RPC + account-gate/claim flow. **The acquisition surface.**
- **PR 9 · Request-to-book flow** — `app/coaching/request.tsx` + `request_booking` RPC + `create-booking-intent` fn (manual capture, card/wallet/ACH).
- **PR 10 · Coach accept/decline** — `app/coach/requests.tsx`, `request/[id].tsx` + `accept`/`decline` RPCs + `capture`/`release` fns + auto-expiry job.
- **PR 11 · "My Coaches" + booking management** — `app/coaching/index.tsx`, `booking/[id].tsx`, reschedule/cancel + `refund-booking` fn.
- **PR 12 · Notifications + reminders** — coaching templates, wire `send-notification` events, `send-lesson-reminders` fn + GitHub Actions cron.
- **PR 13 · Basic earnings + admin metrics** — `app/coach/earnings.tsx` + `admin/` Coaches/Bookings pages & RPCs.

### Phase 2 (after v1 validates) — per PRD §6
Small Group/Clinic/Camp (capacity, seats, **waitlist**, deposits), criteria-based caliber gating, named sub-groups, coach-edited T&C/cancellation policy, external calendar sync, Venmo (Braintree decision), in-app discovery directory/search.

### Phase 3
Two-sided reviews & ratings, recurring lesson packages/pre-paid blocks, multi-coach facilities & staff/admin roles.

---

## 11. Edge cases — implementation home (PRD §7.12)

| Edge case | Where it's handled |
|---|---|
| Last-seat race | `slots` `EXCLUDE` constraint + `UPDATE … WHERE seats_taken < seats_total` inside `request_booking` RPC (txn). |
| Request expiry | `expires_at` + auto-expiry sweep in `send-lesson-reminders`/dedicated cron → `release-booking-intent`. |
| ACH return after confirm | `stripe-webhook` handles `payment_intent.payment_failed`/charge returned → `payment_events` + booking to `payment_status='failed'`, notify + recovery policy. |
| Coach edits availability w/ bookings | RPC/trigger blocks deleting a `booked` slot; must cancel (→ refund + notice). |
| New athlete inline | `request_booking` accepts an inline-created athlete; reuse existing `create_athlete` RPC (`00021`). |
| Time zones | Store UTC (`TIMESTAMPTZ`); display facility-local + parent-local in UI. |
| Minor data minimization | Coach sees only listing-eligibility fields pre-accept; full profile/contact via `get_coach_request_detail` post-eligibility. |
| Surcharge legality | State-rule check gates card surcharge; ACH unrestricted. ⚖️ |
| Disputes/chargebacks | `stripe-webhook` `charge.dispute.created` → `payment_events` + admin alert. |

---

## 12. Risks & test focus
- **Leakage (existential):** make in-platform ACH the path of least resistance; no easy "mark as paid via Venmo" in v1. Track `% in-platform vs off` from day one.
- **Payments correctness:** the manual-capture authorize→capture→refund lifecycle and webhook idempotency are the highest-risk code. Build with Stripe test mode + a 55-case-style QA pass on booking states before any real money.
- **Trust & safety / minors:** data-minimization RPC boundary and SafeSport gating are not optional — pair with legal (PRD §10.8/§10.10).
- **Cold-start:** ship public profile pages + coach-driven supply before any browse/search UI.
- **Scope creep:** resist clinics/camps/groups/Venmo/discovery/reviews in v1 — they're explicitly phased out above.

---

*Build from §10's PR sequence top-to-bottom. PRs 1–3 unblock everything; PRs 4–7 stand up the supply side (the acquisition engine); PRs 8–13 complete the loop. Phase 2/3 wait for v1 signal.*
