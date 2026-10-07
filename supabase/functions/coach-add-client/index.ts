// coach-add-client: emails for the coach's client list.
//   POST { action: 'invite', pending_id }                         → invite a parent who isn't on RallyHUB yet
//   POST { action: 'welcome', connection_id }                     → tell an existing parent the coach added them
//   POST { action: 'request_signature', connection_id, athlete_id } → ask the family to sign terms + release for that athlete
// JWT: the coach. Returns { emailed, email_status, pushed }.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { emailHtml, sendEmail } from '../_shared/templates.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const SITE = 'https://rally-hub.com';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

async function pushTo(userId: string, title: string, body: string, data: Record<string, unknown>) {
  const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', userId);
  if (!tokens?.length) return 0;
  await fetch(EXPO_PUSH_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default', data }))),
  }).catch(() => {});
  return tokens.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  const { data: coach } = await admin.from('coaches')
    .select('id, display_name, slug, booking_page_published').eq('user_id', auth.user.id).maybeSingle();
  if (!coach) return json({ error: 'not a coach' }, 403);
  const c = coach as any;
  const bookUrl = c.booking_page_published && c.slug ? `${SITE}/book/${c.slug}` : `${SITE}/auth?signup=true`;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'invite') {
    const { data: p } = await admin.from('coach_pending_clients').select('*').eq('id', body.pending_id).eq('coach_id', c.id).maybeSingle();
    if (!p) return json({ error: 'client not found' }, 404);
    const pc = p as any;
    const subject = `${c.display_name} added ${pc.athlete_first_name} on RallyHUB`;
    const text = `${c.display_name} uses RallyHUB to schedule lessons and keep waivers on file. Create your free account with this email address (${pc.parent_email}) and ${pc.athlete_first_name} will already be connected, so you can see open times and book.`;
    const r = await sendEmail(SENDGRID_API_KEY, pc.parent_email, subject, emailHtml(text, { label: 'Create my free account', url: `${SITE}/auth?signup=true` },
      `Prefer to look first? See ${c.display_name}'s open times: ${bookUrl}`));
    await admin.from('coach_pending_clients').update({ invited_at: new Date().toISOString() }).eq('id', pc.id);
    return json({ emailed: r === true, email_status: r === true ? 202 : r, pushed: 0 });
  }

  // The rest act on a connected family.
  const { data: cc } = await admin.from('coach_connections').select('id, parent_user_id').eq('id', body.connection_id).eq('coach_id', c.id).maybeSingle();
  if (!cc) return json({ error: 'client not found' }, 404);
  const parentId = (cc as any).parent_user_id as string;
  const { data: parent } = await admin.auth.admin.getUserById(parentId);
  const email = parent?.user?.email;

  if (body.action === 'welcome') {
    const title = `${c.display_name} added you as a client`;
    const text = `You're connected with ${c.display_name} on RallyHUB. See open times and book lessons from the app.`;
    await admin.from('notification_log').insert({ user_id: parentId, notification_type: 'schedule_change', channel: 'push', message: `${title}. ${text}`, status: 'sent' });
    const pushed = await pushTo(parentId, title, text, { type: 'coach_announcement', coachId: c.id });
    const r = email ? await sendEmail(SENDGRID_API_KEY, email, title, emailHtml(text, { label: 'See open times', url: `${SITE}/coaching/${c.id}` })) : 'no email';
    return json({ emailed: r === true, email_status: r === true ? 202 : r, pushed });
  }

  if (body.action === 'request_signature') {
    const { data: a } = await admin.from('athletes').select('id, first_name').eq('id', body.athlete_id).maybeSingle();
    if (!a) return json({ error: 'athlete not found' }, 404);
    const athlete = (a as any).first_name;
    const link = `${SITE}/coaching/sign?coachId=${c.id}&athleteId=${(a as any).id}`;
    const title = `${c.display_name}: please sign for ${athlete}`;
    const text = `${c.display_name} needs ${athlete}'s lesson terms and release signed before the next lesson. It takes a minute, and it stays on file.`;
    await admin.from('notification_log').insert({ user_id: parentId, notification_type: 'schedule_change', channel: 'push', message: `${title}. ${text}`, status: 'sent' });
    const pushed = await pushTo(parentId, title, text, { type: 'sign_release', coachId: c.id, athleteId: (a as any).id });
    const r = email ? await sendEmail(SENDGRID_API_KEY, email, title, emailHtml(text, { label: `Sign for ${athlete}`, url: link })) : 'no email';
    return json({ emailed: r === true, email_status: r === true ? 202 : r, pushed });
  }

  return json({ error: 'unknown action' }, 400);
});
