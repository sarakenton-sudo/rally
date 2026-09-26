# RallyHUB Coaching — Payments Technical Doc

**Scope:** the money path for the Coaching & Lessons module — Stripe Connect topology, the authorize→capture→refund lifecycle, ACH handling, webhooks, fee math, and the edge functions that own it all.
**Companion to:** `docs/coaching-build-spec.md` (this doc expands §6 of the build spec).
**Status:** technical design. No payment code exists in the repo today — this is greenfield.

> Hard rule: **the Stripe secret key never touches the client.** Every Stripe API call lives in a Supabase edge function (Deno, service-role), following the existing `supabase/functions/*` conventions. The client only ever receives a PaymentIntent **client secret** and confirms it with Stripe.js / the RN Stripe SDK.

---

## 1. Topology — Connect Express, destination charges

```
                 ┌─────────────────────────────────────────────┐
                 │            RallyHUB (Platform)               │
                 │   Stripe platform account · merchant-adjacent│
                 └───────────────┬─────────────────────────────┘
                                 │ application_fee_amount (take-rate)
        parent pays ────────────▼─────────────────────────────►  coach
   (card / Apple Pay /     destination charge            Connect Express acct
    Google Pay / ACH)      capture_method='manual'       (KYC + 1099-K by Stripe)
```

- **Each coach = one Stripe Connect *Express* account.** Stripe runs KYC/identity and issues the coach's 1099-K. RallyHUB never holds the coach's banking data. `coaches.stripe_account_id` stores the `acct_…` id; `coaches.identity_verified` mirrors Stripe's `charges_enabled`/`payouts_enabled`.
- **Destination charges with `application_fee_amount`.** The charge is created on the *platform* with `transfer_data.destination = acct_…`. Stripe moves the net to the coach and the `application_fee_amount` (RallyHUB's take-rate) to the platform, automatically. Refunds reverse proportionally.
- **Why Express (not Standard/Custom):** lowest build + compliance burden; Stripe-hosted onboarding & dashboard for the coach; platform keeps fee control and a clean payout story. Custom would put more MoR/compliance weight on RallyHUB for no v1 benefit.

> ⚖️ **Merchant-of-record / liability** (PRD §10.10) still needs legal sign-off. Destination-charge topology keeps RallyHUB as facilitator rather than seller-of-the-lesson, which is the intended posture — confirm with counsel before GA.

---

## 2. The lifecycle state machine

One mechanism covers both PRD flows. **Request-to-book** = manual-capture PaymentIntent authorized at request, captured on accept. **Instant-book** = the same intent captured immediately.

```
   parent submits request
        │  request_booking() RPC reserves slot (status='held')   [DB txn, EXCLUDE guard]
        ▼
   create-booking-intent  ──►  PaymentIntent(capture_method='manual')  ─► requires_confirmation
        │  client confirms (Stripe.js / RN SDK) with payment method
        ▼
   PI: requires_capture        booking_request.status='requested'   payment_status='authorized'
        │
        ├── coach ACCEPTS ──► capture-booking-intent ─► PI captured ─► booking row, payment_status='captured', slot='booked'
        │
        ├── coach DECLINES ─► release-booking-intent ─► PI canceled  ─► auth released, slot back to 'open'
        │
        └── EXPIRES (no response by expires_at) ─► release-booking-intent (same as decline)

   after a confirmed booking:
        cancel_booking() ──► refund-booking ─► full/partial refund per policy ─► payment_status='refunded'
```

**Instant-book variant:** `create-booking-intent` sets `capture_method='automatic'` (or captures right after confirmation); no coach-accept step. Everything else identical.

**Authoritative status lives in two places, reconciled by webhooks:**
- App-level: `booking_requests.status`, `bookings.status`, `bookings.payment_status`.
- Stripe-level: PaymentIntent status. The `stripe-webhook` function is the **single source of truth reconciler** — DB writes from RPCs are optimistic; webhook events confirm/correct them and are the only writer of terminal payment states.

---

## 3. Edge functions — contracts

All follow the repo convention: Deno `serve()`, service-role Supabase client, CORS preamble, `jsonResponse()` helper, deploy via
`npx supabase functions deploy <name> --project-ref dtoolzolnxfjlivwyblv`.

### 3.1 `stripe-connect-onboard`
Create or resume a coach's Express account and return a one-time onboarding/refresh link.
```
POST  { coach_id }
→ 200 { url }                       // Stripe AccountLink — client opens in browser/WebView
```
- Creates `acct_…` if `coaches.stripe_account_id` is null (`type:'express'`, capabilities `card_payments`, `us_bank_account_ach_payments`, `transfers`).
- Persists `stripe_account_id`. KYC result arrives later via `account.updated` webhook → sets `identity_verified`, gates public-listing eligibility (PRD §7.1).

### 3.2 `create-booking-intent`
Called right after the `request_booking` RPC has reserved the slot.
```
POST  { request_id, payment_method_type }   // 'card' | 'us_bank_account'
→ 200 { client_secret, payment_intent_id, amount_breakdown }
```
- Loads request + session type + coach; computes the breakdown (§4).
- Creates PaymentIntent:
  - `amount` = parent's total (price + service_fee if surcharge)
  - `currency:'usd'`
  - `capture_method` = `'manual'` (request) | `'automatic'` (instant)
  - `application_fee_amount` = `platform_fee_cents`
  - `transfer_data.destination` = coach `acct_…`
  - `payment_method_types`: `['card']` or `['us_bank_account']` (ACH)
  - `metadata`: `{ request_id, coach_id, parent_user_id, athlete_id }`  ← critical for webhook routing
- Writes `booking_requests.payment_intent_id`. Returns `client_secret` to the client to confirm.

### 3.3 `capture-booking-intent`
Called by the `accept_booking_request` RPC path (coach accepts).
```
POST  { request_id }
→ 200 { booking_id, payment_status }
```
- Verifies caller is the coach (defense-in-depth; RPC already gated).
- `stripe.paymentIntents.capture(pi)`.
- Inserts `bookings` row, writes `payment_events('captured')`. (Terminal confirm still re-asserted by webhook.)

### 3.4 `release-booking-intent`
Decline or auto-expiry.
```
POST  { request_id, reason }   // 'declined' | 'expired'
→ 200 { released: true }
```
- `stripe.paymentIntents.cancel(pi)` → releases the card authorization.
- Slot returns to `open`; parent notified.

### 3.5 `refund-booking`
Cancellation per policy, full or partial.
```
POST  { booking_id, amount_cents? }   // omit amount = full refund
→ 200 { refund_id, payment_status }
```
- `stripe.refunds.create({ payment_intent, amount?, refund_application_fee: <per policy> })`.
- `reverse_transfer:true` so the coach's share is clawed back proportionally.
- ACH refunds route to the originating bank account (slower settlement; surface "refund processing" to parent).

### 3.6 `stripe-webhook`
The reconciler. **Signature-verified, idempotent.**
```
POST  (raw body)  Stripe-Signature: …
→ 200 { received: true }   // always 200 once verified+recorded, even on no-op
```
- Verify with `STRIPE_WEBHOOK_SECRET` (use the raw request body — do **not** JSON.parse before verifying).
- **Idempotency:** insert `payment_events(stripe_event_id)` first; the `UNIQUE` constraint means a duplicate delivery short-circuits (already processed → return 200).
- Route by `event.type` (§5).

---

## 4. Fee math

Let `P` = session list price (cents), `T` = platform take-rate (cents, from policy), `proc` = Stripe processing (card ≈ 2.9%+30¢; ACH ≈ 0.8% capped $5).

| `coaches.fee_handling` | Parent pays | `application_fee_amount` | Coach nets | Notes |
|---|---|---|---|---|
| **absorb** | `P` | `T` | `P − T − proc` | Coach eats processing. `service_fee_cents = 0`. |
| **surcharge** | `P + service_fee` | `T` | `P − T` (≈whole) | `service_fee_cents` itemized to parent; sized to recover `proc`. |

**Columns this maps to** (`bookings`): `price_cents` = `P`, `service_fee_cents` = surcharge line, `platform_fee_cents` = `T`.

**Surcharge guardrails (⚖️ legal — PRD §10.2):**
- **Card surcharge is regulated**: card-network caps (≤ the cost of acceptance, hard-capped ~3% / 4%) and **banned/limited in some states**. Gate card surcharge behind a `state-eligible` check; cap at the network max; never surcharge on debit where prohibited.
- **ACH surcharge is effectively unrestricted and tiny** — this is the lever to keep volume in-platform (PRD copy: "Pay by bank (ACH) to skip most of it.").

**Take-rate display (PRD §10.1):** `platform_fee_cents` is stored regardless; **build default = embedded** (not shown as a separate parent line). Flip to itemized later by rendering it — no schema change.

---

## 5. Webhook event → handler map

| `event.type` | Handler action |
|---|---|
| `payment_intent.amount_capturable_updated` | Auth succeeded → ensure `payment_status='authorized'`; if instant-book, trigger capture. |
| `payment_intent.succeeded` | Capture settled → `payment_status='captured'`, booking `confirmed`. Idempotent confirm. |
| `payment_intent.payment_failed` | Auth/capture failed → `payment_status='failed'`; if it was a confirmed **ACH** that later returned, run §6 recovery. |
| `payment_intent.canceled` | Decline/expiry release recorded. |
| `charge.refunded` | `payment_status='refunded'` (or partial); write `payment_events('refunded')`. |
| `charge.dispute.created` | Flag booking disputed; alert ops (admin); freeze further payout actions on it. |
| `account.updated` | Sync `identity_verified` from `charges_enabled && payouts_enabled`; toggle public-listing eligibility. |
| `payout.paid` / `payout.failed` | Record coach payout for the earnings view. |

Every handler: look up the row via `metadata.request_id` / PI id, write an append-only `payment_events` row, then patch booking state. **Never** trust client callbacks for terminal money state — only this function writes `captured`/`refunded`/`failed`.

---

## 6. ACH specifics

ACH (`us_bank_account`) is the low-fee in-platform path — and the leakage antidote (PRD §7.8). It also settles in **business days** and can **return after the fact**.

**Confirmation policy (PRD §10.3) — build default:**
- **First-time payer for this coach** (no prior `captured` booking on the `coach_connections` pair) → **pending-clear**: booking shows `payment_status='authorized'` / status surfaced as "payment processing"; do not treat as fully confirmed until `payment_intent.succeeded`.
- **Returning payer** → **immediate confirm** on submission; accept the small settlement risk.

**ACH return after a confirmed booking (the nasty edge case, PRD §7.12):**
1. `payment_intent.payment_failed` (return code) arrives post-confirmation.
2. Set `payment_status='failed'`; `payment_events('ach_returned', raw)`.
3. Recovery ladder: notify parent + coach → offer re-pay (new intent, card) → if unpaid within window, move booking to `cancelled` and release the slot.
4. Never silently delete; keep the audit trail.

---

## 7. Concurrency & idempotency

- **Last-seat / double-book:** enforced in Postgres, not Stripe. The `slots` `EXCLUDE USING gist (… tstzrange …)` constraint + `UPDATE slots SET seats_taken = seats_taken+1 WHERE seats_taken < seats_total` inside `request_booking` mean the loser's transaction fails *before* any PaymentIntent is created. No money touched on the losing request.
- **Webhook idempotency:** `payment_events.stripe_event_id UNIQUE`. Stripe retries deliveries; the unique insert makes reprocessing a no-op.
- **Client retries:** pass a Stripe **idempotency key** = `request_id` on `create-booking-intent` so a double-tap can't create two PaymentIntents.
- **RPC vs webhook ordering:** RPC writes are optimistic and may race the webhook. Webhook handlers must be **upsert-style** and tolerate "row already in target state."

---

## 8. Config & secrets

Set via `npx supabase secrets set …` (consumed with `Deno.env.get(...)`, matching `send-notification`):

| Secret | Use |
|---|---|
| `STRIPE_SECRET_KEY` | All server-side Stripe calls. |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` signature verification. |
| `STRIPE_CONNECT_CLIENT_ID` | Connect onboarding. |

Client needs only the **publishable** key (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`) for Stripe.js / `@stripe/stripe-react-native`.

---

## 9. Test plan (Stripe test mode, before any real money)

Run as a QA matrix in the style of the existing 55-case suite. Use Stripe test PMs (`4242…` card, `pm_usBankAccount` test, declines `4000000000000002`, ACH return `…9995`).

1. Request → authorize → **accept** → capture → confirmed. ✔ amounts, ✔ application_fee, ✔ coach net.
2. Request → authorize → **decline** → auth released, slot reopened, $0 captured.
3. Request → authorize → **expiry** → same as decline.
4. **Instant-book** → immediate capture.
5. **Absorb vs surcharge** fee math (card + ACH) → parent total + coach net correct.
6. **ACH first-time** → pending-clear; succeeds → confirmed.
7. **ACH return post-confirm** → recovery ladder fires.
8. **Cancellation** inside/outside window → full/partial/no refund per policy; `reverse_transfer` correct.
9. **Last-seat race** (2 concurrent requests, 1 seat) → exactly one PI created.
10. **Webhook idempotency** → replay an event → no double state change.
11. **Dispute** → flagged + ops alerted.
12. **Connect not yet verified** → booking blocked / coach can't go public.

---

## 10. Compliance checklist (⚖️ legal before GA)
- Merchant-of-record posture confirmed for destination-charge model (§1).
- Liability/participation waiver, esp. **minors**, versioned per booking (`accepted_terms_version`).
- **Card surcharge** legality by state + network caps (§4).
- **1099-K** issuance owned by Stripe (Express) — confirm thresholds messaging to coaches.
- Refund/chargeback handling and parent disclosures.
- Data minimization of athlete (minor) data pre-accept (enforced in the request-detail RPC, not here, but referenced).

---

*Build order for this layer (from the build spec §10): PR 6 (`stripe-connect-onboard` + `account.updated` webhook) → PR 9 (`create-booking-intent`) → PR 10 (`capture`/`release`) → PR 11 (`refund-booking`). The `stripe-webhook` reconciler is scaffolded in PR 6 and extended in each subsequent PR as new event types come online.*
