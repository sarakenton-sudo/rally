// notify-coach-joined: push + email the parent whose invite a coach just used.
//   POST { code }  (JWT: the coach who claimed it)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  const { code } = await req.json().catch(() => ({}));
  const clean = String(code ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const { data: inv } = await admin.from('coach_invites')
    .select('inviter_user_id, status, coaches(user_id, display_name), athletes(first_name)').eq('code', clean).maybeSingle();
  const i = inv as any;
  // Only the coach who joined with this code can trigger it.
  if (!i || i.status !== 'joined' || i.coaches?.user_id !== auth.user.id) return json({ error: 'not found' }, 404);

  const coach = i.coaches?.display_name ?? 'Your coach';
  const title = `${coach} joined RallyHUB`;
  const body = `${coach} accepted your invite${i.athletes?.first_name ? ` for ${i.athletes.first_name}` : ''}. You can see their open times and book lessons now.`;

  const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', i.inviter_user_id);
  if (tokens?.length) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default', data: { type: 'coach_joined' } }))),
    }).catch(() => {});
  }
  let emailStatus: number | string = 'skipped';
  const { data: parent } = await admin.auth.admin.getUserById(i.inviter_user_id);
  if (parent?.user?.email && SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SENDGRID_API_KEY}` },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: parent.user.email }] }],
        from: { email: 'hello@rally-hub.com', name: 'RallyHUB' }, subject: title,
        content: [{ type: 'text/html', value: `<p>${esc(body)}</p><p><a href="https://rally-hub.com/app">Book a lesson in RallyHUB</a></p>` }],
      }),
    });
    emailStatus = r.status;
  }
  return json({ pushed: tokens?.length ?? 0, email_status: emailStatus });
});
