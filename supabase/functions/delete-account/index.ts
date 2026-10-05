// delete-account: the signed-in person permanently deletes their RallyHUB account
// (App Store guideline 5.1.1(v)). Refuses while they have upcoming confirmed
// lessons (as a parent or a coach). Deletes athletes only they manage; shared
// athletes stay with the other manager.
//   POST {}  (JWT: the account being deleted)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: 'auth required' }, 401);
  const now = new Date().toISOString();

  // 1. Upcoming confirmed lessons block deletion (families/coaches would be left hanging).
  const { data: coach } = await admin.from('coaches').select('id').eq('user_id', uid).maybeSingle();
  const { data: asParent } = await admin.from('bookings').select('id, slots!inner(starts_at)')
    .eq('parent_user_id', uid).eq('status', 'confirmed').gt('slots.starts_at', now).limit(1);
  const { data: asCoach } = coach
    ? await admin.from('bookings').select('id, slots!inner(starts_at)').eq('coach_id', coach.id).eq('status', 'confirmed').gt('slots.starts_at', now).limit(1)
    : { data: [] as unknown[] };
  if ((asParent?.length ?? 0) + (asCoach?.length ?? 0) > 0) {
    return json({ error: 'You have upcoming lessons. Cancel them first, then delete your account.' }, 409);
  }

  // 2. Athletes only this person manages (decided before the account goes).
  const { data: mine } = await admin.from('admin_athletes').select('athlete_id').eq('admin_id', uid);
  const soleAthletes: string[] = [];
  for (const { athlete_id } of mine ?? []) {
    const { count } = await admin.from('admin_athletes').select('admin_id', { count: 'exact', head: true })
      .eq('athlete_id', athlete_id).neq('admin_id', uid).eq('permission', 'manage');
    if (!count) soleAthletes.push(athlete_id);
  }

  // 3. Delete the account (cascades the rows keyed to the user), then their athletes.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error('[delete-account] deleteUser', delErr.message);
    return json({ error: "We couldn't delete your account. Email hello@rally-hub.com and we'll do it within 48 hours." }, 500);
  }
  const leftovers: string[] = [];
  for (const id of soleAthletes) {
    await admin.from('bookings').delete().eq('athlete_id', id); // past lessons (bookings.athlete_id has no cascade)
    const { error } = await admin.from('athletes').delete().eq('id', id);
    if (error) leftovers.push(id);
  }
  if (leftovers.length) {
    await admin.from('error_log').insert({ screen: 'delete-account', action: 'delete athletes', error_type: 'cleanup', severity: 'warning', error_message: `athletes not deleted after account deletion: ${leftovers.join(',')}` }).then(() => {}, () => {});
  }
  return json({ deleted: true, athletes_deleted: soleAthletes.length - leftovers.length });
});
