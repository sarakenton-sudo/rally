#!/usr/bin/env node
// Finish setting up the invited test accounts (co-parent, view-only
// co-parent, athlete) the same way a real invitee does: sign up, then
// accept the parent's invite code. Safe to rerun.
//   node scripts/qa/setup-accounts.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.qa' });
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL, ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(URL, ANON, { auth: { persistSession: false } });
const env = (k) => process.env[k];

// 1. Read the test parent's invites.
const parent = client();
const { error: pErr } = await parent.auth.signInWithPassword({ email: env('QA_PARENT_EMAIL'), password: env('QA_PARENT_PASSWORD') });
if (pErr) { console.error(`Test parent can't sign in: ${pErr.message}`); process.exit(1); }
const { data: invites, error: iErr } = await parent.from('athlete_invites')
  .select('email, invite_code, invite_type, permission, status, expires_at').order('created_at', { ascending: false });
if (iErr) { console.error(`Couldn't read invites: ${iErr.message}`); process.exit(1); }
console.log(`Test parent has ${invites.length} invite(s):`);
for (const i of invites) console.log(`  ${i.email}  ${i.invite_type}/${i.permission ?? '-'}  ${i.status}`);

// 2. Sign up (or sign in) each invitee and accept their invite.
let todo = 0;
for (const [role, label] of [['COADMIN', 'co-parent'], ['VIEWER', 'view-only co-parent'], ['ATHLETE', 'athlete']]) {
  const email = env(`QA_${role}_EMAIL`), password = env(`QA_${role}_PASSWORD`);
  if (!email) continue;
  console.log(`\n${label}: ${email}`);
  const invite = invites.find((i) => i.email?.toLowerCase() === email.toLowerCase());
  if (!invite) { console.log(`  ✗ No invite to this address. Invite it from the test parent's account first.`); todo++; continue; }

  const c = client();
  let { data: s, error } = await c.auth.signInWithPassword({ email, password });
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      console.log('  … Account exists but the email isn\'t confirmed. Click the link in Gmail, then rerun.'); todo++; continue;
    }
    const up = await c.auth.signUp({ email, password, options: { data: { account_type: 'parent' } } });
    if (up.error) { console.log(`  ✗ Sign-up failed: ${up.error.message}`); todo++; continue; }
    if (!up.data.session) {
      console.log('  ✓ Account created. Supabase requires email confirmation: click the link in Gmail, then rerun.');
      console.log('    ⚠ The website accepts the invite right after sign-up, before confirmation, so it would fail here.');
      todo++; continue;
    }
    s = up.data;
    console.log('  ✓ Account created (no email confirmation needed)');
  } else console.log('  ✓ Signed in');

  if (invite.status === 'accepted') { console.log('  ✓ Invite already accepted'); continue; }
  const { data: r, error: aErr } = await c.rpc('accept_athlete_invite', { code: invite.invite_code });
  if (aErr || !r?.success) { console.log(`  ✗ Accepting the invite failed: ${aErr?.message ?? r?.error}`); todo++; }
  else console.log(`  ✓ Invite accepted (${invite.invite_type}, ${invite.permission ?? 'n/a'})`);
}
console.log(todo ? `\n${todo} account(s) still need a step above.` : '\nAll test accounts are ready. Run: npm run qa');
