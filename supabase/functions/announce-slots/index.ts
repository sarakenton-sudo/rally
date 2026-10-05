// announce-slots: a coach tells families about open times.
//   POST { slot_ids[], audience: 'all'|'group'|'families', group_id?, connection_ids?, message }
//        (JWT: the coach) → push + email to each family; logged in announcements
//   GET  ?unsub=<connection_id>&sig=<hmac>  → one-tap unsubscribe from a coach's announcements
// SMS is not sent (US carrier A2P registration pending).
// Deploy with --no-verify-jwt (the GET link has no JWT); POST checks the JWT itself.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const SIGNING_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const DAILY_CAP = 3;
const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const page = (title: string, body: string) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font-family:-apple-system,sans-serif;background:#F4F6F8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;color:#1E3A5F">` +
  `<div style="max-width:360px"><h2>${title}</h2><p style="color:#6B8BA8">${body}</p></div></body>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // ---- Unsubscribe link from an announcement email ----
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const conn = u.searchParams.get('unsub') ?? '';
    if (!conn || u.searchParams.get('sig') !== (await sign(conn))) return page('Link not valid', 'This unsubscribe link has expired or is incomplete.');
    await supabaseAdmin.from('coach_connections').update({ marketing_opt_out: true }).eq('id', conn);
    return page("You're unsubscribed", "You won't get open-time announcements from this coach anymore. Lesson confirmations and reminders still come through.");
  }

  // ---- Send ----
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await supabaseAdmin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  const { data: coach } = await supabaseAdmin
    .from('coaches').select('id, display_name, slug, booking_page_published, default_timezone').eq('user_id', auth.user.id).maybeSingle();
  if (!coach) return json({ error: 'not a coach' }, 403);

  const body = await req.json().catch(() => ({}));
  const slotIds: string[] = Array.isArray(body.slot_ids) ? body.slot_ids : [];
  const message = String(body.message ?? '').trim().slice(0, 600);
  if (!message) return json({ error: 'Write a message' }, 400);

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count } = await supabaseAdmin.from('announcements').select('id', { count: 'exact', head: true }).eq('coach_id', coach.id).gte('sent_at', since);
  if ((count ?? 0) >= DAILY_CAP) return json({ error: `You can send ${DAILY_CAP} announcements a day — try again tomorrow.` }, 429);

  // Recipients: active, not opted out, filtered by audience.
  let q = supabaseAdmin.from('coach_connections').select('id, parent_user_id').eq('coach_id', coach.id).eq('status', 'active').eq('marketing_opt_out', false);
  if (body.audience === 'families') q = q.in('id', Array.isArray(body.connection_ids) && body.connection_ids.length ? body.connection_ids : ['00000000-0000-0000-0000-000000000000']);
  if (body.audience === 'group') {
    const { data: members } = await supabaseAdmin.from('client_group_members').select('connection_id').eq('group_id', body.group_id ?? '');
    q = q.in('id', (members ?? []).map((m: any) => m.connection_id).concat(['00000000-0000-0000-0000-000000000000']));
  }
  const { data: conns } = await q;
  const recipients = (conns ?? []) as { id: string; parent_user_id: string }[];
  if (!recipients.length) return json({ error: 'No families to send to (some may have unsubscribed).' }, 400);

  const link = coach.booking_page_published && coach.slug ? `https://rally-hub.com/book/${coach.slug}` : 'https://rally-hub.com/app';
  const title = `${coach.display_name} has open lesson times`;
  let pushed = 0, emailed = 0;

  for (const r of recipients) {
    const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', r.parent_user_id);
    if (tokens?.length) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body: message.slice(0, 180), sound: 'default', data: { type: 'coach_announcement', coachId: coach.id } }))),
      }).catch(() => {});
      pushed += 1;
    }
    if (SENDGRID_API_KEY) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.parent_user_id);
      const to = u?.user?.email;
      if (to) {
        const unsub = `${SUPABASE_URL}/functions/v1/announce-slots?unsub=${r.id}&sig=${await sign(r.id)}`;
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SENDGRID_API_KEY}` },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: 'hello@rally-hub.com', name: `${coach.display_name} via RallyHUB` },
            subject: title,
            content: [{
              type: 'text/html',
              value: `<div style="font-family:-apple-system,sans-serif;max-width:520px;color:#1E3A5F">` +
                `<p style="font-size:16px;line-height:1.5">${esc(message).replace(/\n/g, '<br>')}</p>` +
                `<p><a href="${link}" style="display:inline-block;background:#3B82B0;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">See open times</a></p>` +
                `<p style="font-size:12px;color:#8FA8BF">You're getting this because you've booked lessons with ${esc(coach.display_name)} on RallyHUB. <a href="${unsub}" style="color:#8FA8BF">Unsubscribe from announcements</a></p></div>`,
            }],
            headers: { 'List-Unsubscribe': `<${unsub}>` },
          }),
        });
        if (res.ok) emailed += 1;
      }
    }
  }

  await supabaseAdmin.from('announcements').insert({
    coach_id: coach.id,
    audience: body.audience === 'group' ? `group:${body.group_id}` : body.audience === 'families' ? 'families' : 'all',
    slot_ids: slotIds, message, recipient_count: recipients.length,
  });

  return json({ recipients: recipients.length, pushed, emailed });
});
