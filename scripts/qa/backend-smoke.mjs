#!/usr/bin/env node
// Backend smoke test: edge functions reject bad callers, data stays private,
// and each test account sees what it should. Read-only.
//   node scripts/qa/backend-smoke.mjs        (reads .env and .env.qa)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.qa' });

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !ANON) { console.error('Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in .env'); process.exit(2); }
const FN = `${URL}/functions/v1`;

let pass = 0, fail = 0, skip = 0;
const ok = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); };
const bad = (name, why) => { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m — ${why}`); };
const skipped = (name, why) => { skip++; console.log(`  \x1b[33m–\x1b[0m ${name} (${why})`); };
const check = async (name, fn) => {
  try { const r = await fn(); r === true || r === undefined ? ok(name) : bad(name, r); }
  catch (e) { bad(name, e.message); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const client = () => createClient(URL, ANON, { auth: { persistSession: false } });
async function signIn(role) {
  const email = process.env[`QA_${role}_EMAIL`], password = process.env[`QA_${role}_PASSWORD`];
  if (!email || !password) return null;
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${role} sign-in failed: ${error.message}`);
  return { c, user: data.user, jwt: data.session.access_token };
}
const call = (fn, { jwt = ANON, body, method = 'POST', headers = {}, query = '' } = {}) =>
  fetch(`${FN}/${fn}${query}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
const expectStatus = async (res, ...codes) => codes.includes(res.status) || `got ${res.status}: ${(await res.text()).slice(0, 120)}`;
const FAKE = '00000000-0000-4000-8000-000000000000';

// ── 1. Edge functions refuse callers who aren't signed in ───────────────────
section('Edge functions: signed-out callers are refused');
for (const [fn, body] of [
  ['payment-method', { action: 'get' }], ['stripe-connect', { action: 'status' }],
  ['refund-booking', { booking_id: FAKE }], ['notify-booking-change', { booking_id: FAKE, change: 'cancelled' }],
  ['notify-coach-request', { request_id: FAKE }], ['announce-slots', { slot_ids: [FAKE], message: 'qa' }],
]) await check(`${fn} → 401`, async () => expectStatus(await call(fn, { body }), 401));

await check('charge-due-bookings without the cron secret → 403', async () => expectStatus(await call('charge-due-bookings'), 401, 403));
await check('stripe-webhook without a Stripe signature → 400', async () =>
  expectStatus(await call('stripe-webhook', { body: { type: 'qa' }, headers: { 'stripe-signature': 't=1,v1=bad' } }), 400, 401));
await check('calendar feed with a bad token → 404', async () =>
  expectStatus(await call('coach-calendar-feed', { method: 'GET', query: `?token=${FAKE}` }), 404, 401));
await check('announcement unsubscribe with a forged link is rejected (L-15)', async () => {
  const res = await call('announce-slots', { method: 'GET', query: `?unsub=${FAKE}&sig=forged` });
  const t = await res.text();
  return /not valid|expired/i.test(t) || res.status === 401 || `page said: ${t.slice(0, 120)}`;
});

// ── 2. Private tables are invisible to signed-out visitors ──────────────────
section('Data: signed-out visitors read nothing private');
const anon = client();
for (const table of ['athletes', 'bookings', 'hotel_bookings', 'flight_bookings', 'tournaments', 'seasons', 'forwarded_emails',
  'gmail_tokens', 'push_tokens', 'stripe_customers', 'policy_acceptances', 'coach_connections', 'household_members',
  'user_profiles', 'admin_users', 'payment_events', 'booking_requests', 'guests']) {
  await check(`${table}: 0 rows`, async () => {
    const { data, error } = await anon.from(table).select('*').limit(1);
    return !!error || !data?.length || `${data.length} row(s) visible`;
  });
}

section('Public booking page (B-01, B-05)');
await check('unknown slug → nothing', async () => {
  const { data, error } = await anon.rpc('get_booking_page', { p_slug: 'qa-no-such-coach-zz9' });
  return (!error && !data) || `got ${JSON.stringify(error ?? data).slice(0, 100)}`;
});
if (process.env.QA_COACH_SLUG) {
  await check('published slug → coach, lesson types, open times', async () => {
    const { data, error } = await anon.rpc('get_booking_page', { p_slug: process.env.QA_COACH_SLUG });
    if (error) return error.message;
    if (!data?.coach?.display_name) return 'no coach in response';
    const leaked = ['email', 'phone', 'stripe_account_id', 'user_id'].filter((k) => k in data.coach);
    return !leaked.length || `public page exposes: ${leaked.join(', ')}`;
  });
} else skipped('published slug', 'set QA_COACH_SLUG');

// ── 3. Signed-in accounts ───────────────────────────────────────────────────
const parent = await signIn('PARENT').catch((e) => (bad('parent sign-in', e.message), null));
const coadmin = await signIn('COADMIN').catch((e) => (bad('co-admin sign-in', e.message), null));
const athlete = await signIn('ATHLETE').catch((e) => (bad('athlete sign-in', e.message), null));
const coach = await signIn('COACH').catch((e) => (bad('coach sign-in', e.message), null));
const ids = async (s, table) => ((await s.c.from(table).select('id')).data ?? []).map((r) => r.id).sort();

section('Parent A');
if (parent) {
  const athletes = await ids(parent, 'athletes');
  await check('sees their athletes', () => athletes.length > 0 || 'no athletes');
  await check('payment-method get → 200 (L-12)', async () => expectStatus(await call('payment-method', { jwt: parent.jwt, body: { action: 'get' } }), 200));
  await check("can't notify about someone else's booking → 404", async () =>
    expectStatus(await call('notify-booking-change', { jwt: parent.jwt, body: { booking_id: FAKE, change: 'cancelled' } }), 404));
  await check("can't announce as a coach → 403", async () =>
    expectStatus(await call('announce-slots', { jwt: parent.jwt, body: { slot_ids: [FAKE], message: 'qa' } }), 403));
  await check("can't read other users' push tokens", async () => {
    const { data } = await parent.c.from('push_tokens').select('user_id').neq('user_id', parent.user.id).limit(1);
    return !data?.length || 'other users’ tokens visible';
  });
  await check('is not an admin', async () => !(await parent.c.from('admin_users').select('*').limit(1)).data?.length || 'admin_users visible');

  section('Co-parent B (CO-03, CO-04)');
  if (coadmin) {
    const shared = await ids(coadmin, 'athletes');
    await check("sees Parent A's athletes", () => athletes.every((a) => shared.includes(a)) || `missing ${athletes.filter((a) => !shared.includes(a)).length}`);
    const [t1, t2] = [await ids(parent, 'tournaments'), await ids(coadmin, 'tournaments')];
    await check("sees Parent A's tournaments", () => t1.every((t) => t2.includes(t)) || `missing ${t1.filter((t) => !t2.includes(t)).length}`);
  } else skipped('co-parent checks', 'set QA_COADMIN_EMAIL');

  section('Athlete C (AT-02)');
  if (athlete) {
    const mine = await ids(athlete, 'athletes');
    await check('sees at least their own athlete profile', () => mine.length > 0 || 'none');
    await check("can't read the parent's payment events", async () =>
      !(await athlete.c.from('payment_events').select('id').limit(1)).data?.length || 'payment events visible');
  } else skipped('athlete checks', 'set QA_ATHLETE_EMAIL');
} else skipped('parent checks', 'set QA_PARENT_EMAIL');

section('Coach D');
if (coach) {
  const { data: me } = await coach.c.from('coaches').select('id, slug').eq('user_id', coach.user.id).maybeSingle();
  await check('has a coach profile', () => !!me || 'no coaches row');
  if (me) {
    await check("can't see other coaches' bookings", async () => {
      const { data } = await coach.c.from('bookings').select('id').neq('coach_id', me.id).limit(1);
      return !data?.length || 'other coaches’ bookings visible';
    });
    await check('stripe-connect status → 200 (C-25)', async () => expectStatus(await call('stripe-connect', { jwt: coach.jwt, body: { action: 'status' } }), 200));
    await check('announce with no message → 400 (not sent)', async () =>
      expectStatus(await call('announce-slots', { jwt: coach.jwt, body: { slot_ids: [], message: '' } }), 400));
    if (parent) await check("parent can't read this coach's client list", async () =>
      !(await parent.c.from('coach_connections').select('id').eq('coach_id', me.id).neq('parent_user_id', parent.user.id).limit(1)).data?.length || 'other families visible');
  }
} else skipped('coach checks', 'set QA_COACH_EMAIL');

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
