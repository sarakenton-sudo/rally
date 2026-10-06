#!/usr/bin/env node
// Seed the App Store reviewer demo family (separate from the QA test accounts,
// which automated tests keep changing). Safe to rerun: skips what exists.
//   node scripts/qa/seed-demo.mjs
// Reviewer parent: QA_REVIEW_EMAIL / QA_REVIEW_PASSWORD (.env.qa)
// Reviewer coach:  the QA coach (Ben) — published booking page, lesson types, gym.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.qa' });
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL, ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const mk = () => createClient(URL, ANON, { auth: { persistSession: false } });
const EMAIL = process.env.QA_REVIEW_EMAIL, PASSWORD = process.env.QA_REVIEW_PASSWORD;
const SLUG = process.env.QA_COACH_SLUG;
if (!EMAIL || !PASSWORD) { console.error('Set QA_REVIEW_EMAIL / QA_REVIEW_PASSWORD in .env.qa'); process.exit(1); }
const ok = (b, m) => { console.log(`${b ? '✓' : '✗'} ${m}`); return b; };

// Dates relative to today, so the demo always looks current.
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const nextSat = (weeksOut) => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7) + 7 * weeksOut); return d.toISOString().slice(0, 10); };
const plus = (ymd, n) => { const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const seasonYear = (() => { const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; })();

// 1. Reviewer parent account.
const parent = mk();
let s = await parent.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (s.error) s = await parent.auth.signUp({ email: EMAIL, password: PASSWORD, options: { data: { account_type: 'parent' } } });
if (!ok(!s.error && s.data.user, `reviewer parent ${EMAIL}${s.error ? ' — ' + s.error.message : ''}`)) process.exit(1);
const uid = s.data.user.id;
await parent.from('user_profiles').update({ display_name: 'Jordan Carter' }).eq('id', uid);

// 2. Family, team and tournaments (same RPC as onboarding).
const { data: existing } = await parent.from('athletes').select('id').limit(1);
const t1 = nextSat(1), t2 = nextSat(3), t3 = nextSat(6);
if (!existing?.length) {
  const r = await parent.rpc('setup_onboarding', {
    p_athlete_name: 'Drue Carter', p_team_name: 'Austin Juniors 14 Black', p_club_name: 'Austin Juniors',
    p_season_year: seasonYear, p_team_code: null, p_streaming_url: null,
    p_gmail_connected: false, p_gmail_email: null, p_trusted_sender_emails: [],
    p_tournaments: [
      { name: 'Lone Star Classic', start_date: t1, end_date: plus(t1, 1), location_city: 'Dallas, TX',
        venues: [{ label: 'Kay Bailey Hutchison Convention Center', address: '650 S Griffin St, Dallas, TX 75202', is_confirmed: true }] },
      { name: 'Austin Fall Kickoff', start_date: t2, end_date: plus(t2, 1), location_city: 'Austin, TX',
        venues: [{ label: 'Austin Sports Center', address: '425 Woodward St, Austin, TX 78704', is_confirmed: true }] },
      { name: 'Houston Holiday Bash', start_date: t3, end_date: plus(t3, 1), location_city: 'Houston, TX',
        venues: [{ label: 'George R. Brown Convention Center', address: '1001 Avenida De Las Americas, Houston, TX 77010', is_confirmed: true }] },
    ],
    p_additional_athletes: [], p_guests: [{ name: 'Grandma Carter', relationship: 'Grandparent', phone: null }],
  });
  ok(!r.error, `family + team + 3 tournaments${r.error ? ' — ' + r.error.message : ''}`);
} else ok(true, 'family already set up');

const { data: season } = await parent.from('seasons').select('id').limit(1).single();
await parent.from('seasons').update({ team_code: 'AJ14BLK', default_streaming_platform: 'YouTube', default_stream_url: 'https://www.youtube.com/@AustinJuniors' }).eq('id', season.id);
const { data: tours } = await parent.from('tournaments').select('id, name, start_date, end_date').order('start_date');
const first = tours?.[0];
if (first) {
  await parent.from('tournaments').update({
    schedule_link: 'https://www.advancedeventsystems.com', ticket_link: 'https://www.advancedeventsystems.com',
    streaming_links: [{ label: 'BallerTV', url: 'https://www.ballertv.com' }],
  }).eq('id', first.id);
  const { data: hotels } = await parent.from('hotel_bookings').select('id').eq('tournament_id', first.id);
  if (!hotels?.length) {
    const h = await parent.from('hotel_bookings').insert({
      created_by_user_id: uid, tournament_id: first.id, hotel_name: 'Hilton Garden Inn Dallas Downtown', platform: 'Direct',
      booking_name: 'Jordan Carter', booked_by: 'Jordan Carter', reservation_number: '84213307',
      check_in: plus(first.start_date, -1), check_out: first.end_date, cancellation_deadline: plus(first.start_date, -3),
      cost: 389, status: 'confirmed', address: '1600 Commerce St, Dallas, TX 75201',
    });
    ok(!h.error, `hotel for ${first.name}${h.error ? ' — ' + h.error.message : ''}`);
  } else ok(true, 'hotel already added');
}

// 3. Family logins (setup adds empty placeholders; fill GroupMe, add AES).
const { data: cfg } = await parent.from('admin_config').select('id, external_links').limit(1).single();
if (cfg) {
  let links = (cfg.external_links ?? []).map((l) => l.label === 'GroupMe' && !l.url
    ? { ...l, url: 'https://web.groupme.com', scope: 'admin', athlete_id: null } : l);
  if (!links.some((l) => l.label === 'AES / SportsEngine')) links.push(
    { label: 'AES / SportsEngine', url: 'https://www.advancedeventsystems.com', icon_name: 'globe-outline', username: 'jordan.carter', password: 'demo-password', scope: 'admin', athlete_id: null });
  const u = await parent.from('admin_config').update({ external_links: links }).eq('id', cfg.id);
  ok(!u.error, `family logins: ${links.filter((l) => l.url).map((l) => l.label).join(', ')}${u.error ? ' — ' + u.error.message : ''}`);
}

// 4. Coach Ben: connect, sign terms, a confirmed lesson ~10 days out.
const { data: ath } = await parent.from('athletes').select('id').limit(1).single();
const coach = mk();
const cs = await coach.auth.signInWithPassword({ email: process.env.QA_COACH_EMAIL, password: process.env.QA_COACH_PASSWORD });
if (cs.error) { ok(false, 'coach sign-in'); process.exit(1); }
const { data: me } = await coach.from('coaches').select('id, display_name').eq('user_id', cs.data.user.id).single();
await parent.rpc('connect_via_booking_page', { p_slug: SLUG });
await parent.rpc('accept_coach_policies', { p_coach_id: me.id, p_athlete_id: ath.id, p_signer_name: 'Jordan Carter' });
await parent.rpc('set_athlete_health', { p_athlete_id: ath.id, p_allergies: 'None', p_medical_notes: '', p_ec_name: 'Jordan Carter', p_ec_phone: '5125550142' });
const { data: mine } = await parent.from('booking_requests').select('id, slots!inner(starts_at)').eq('status', 'accepted').gt('slots.starts_at', new Date().toISOString());
if (mine?.length) ok(true, `upcoming lesson already booked (${mine.length})`);
else {
  const from = new Date(Date.now() + 5 * 864e5).toISOString();
  const { data: open } = await coach.from('slots').select('id, starts_at, seats_taken, seats_total, eligible_session_type_ids')
    .eq('coach_id', me.id).eq('status', 'open').gt('starts_at', from).order('starts_at').limit(10);
  const slot = (open ?? []).find((o) => o.seats_taken < o.seats_total && o.eligible_session_type_ids?.length);
  if (!ok(!!slot, `open time with ${me.display_name} 5+ days out`)) process.exit(1);
  const r = await parent.rpc('request_booking', { p_slot_id: slot.id, p_session_type_id: slot.eligible_session_type_ids[0], p_athlete_id: ath.id, p_terms_version: 'v1-standard', p_notes: 'Working on serve receive', p_film_links: [] });
  if (ok(!r.error, `lesson requested ${slot.starts_at}${r.error ? ' — ' + r.error.message : ''}`) && r.data.booking_mode !== 'instant') {
    const a = await coach.rpc('accept_booking_request', { p_request_id: r.data.request_id });
    ok(!a.error, `coach confirmed it${a.error ? ' — ' + a.error.message : ''}`);
  }
}
console.log(`\nReviewer parent: ${EMAIL} / ${PASSWORD}\nReviewer coach:  ${process.env.QA_COACH_EMAIL} / (QA coach password)`);
