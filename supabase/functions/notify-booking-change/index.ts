// notify-booking-change: tell the parent their lesson was cancelled or moved by
// the coach — push to their devices + an email (they may only use the web app).
//   POST { booking_id, change: 'cancelled' | 'rescheduled' }  (JWT: the booking's coach)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await supabaseAdmin.auth.getUser(jwt);
  const callerId = auth?.user?.id;
  if (!callerId) return json({ error: 'auth required' }, 401);

  const { booking_id, change } = await req.json().catch(() => ({}));
  if (!booking_id || !['cancelled', 'rescheduled'].includes(change)) return json({ error: 'bad request' }, 400);

  const { data: b } = await supabaseAdmin
    .from('bookings')
    .select('id, parent_user_id, change_reason, coaches(user_id, display_name, default_timezone), athletes(first_name), slots(starts_at, facilities(label, address))')
    .eq('id', booking_id)
    .maybeSingle();
  const bk = b as any;
  // Only the booking's coach can trigger this.
  if (!bk || bk.coaches?.user_id !== callerId) return json({ error: 'not found' }, 404);

  const tz = bk.coaches?.default_timezone || 'America/Chicago';
  const when = bk.slots?.starts_at
    ? new Date(bk.slots.starts_at).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const coach = bk.coaches?.display_name ?? 'Your coach';
  const athlete = bk.athletes?.first_name ?? 'your athlete';
  const where = [bk.slots?.facilities?.label, bk.slots?.facilities?.address].filter(Boolean).join(', ');
  const reason = bk.change_reason ? `\n"${bk.change_reason}"` : '';

  const title = change === 'cancelled' ? `${coach} cancelled ${athlete}'s lesson` : `${coach} moved ${athlete}'s lesson`;
  const body = change === 'cancelled'
    ? `The lesson on ${when} is cancelled.${reason}`
    : `New time: ${when}${where ? ` · ${where}` : ''}.${reason}`;

  let pushed = 0;
  const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', bk.parent_user_id);
  if (tokens?.length) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default', data: { type: 'lesson_changed', bookingId: bk.id } }))),
    }).catch((e) => console.error('[notify-booking-change] push', e));
    pushed = tokens.length;
  }

  let emailed = false;
  const { data: parent } = await supabaseAdmin.auth.admin.getUserById(bk.parent_user_id);
  const email = parent?.user?.email;
  if (email && SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SENDGRID_API_KEY}` },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'hello@rally-hub.com', name: 'RallyHUB' },
        subject: title,
        content: [{
          type: 'text/html',
          value: `<p>${esc(body).replace(/\n/g, '<br>')}</p><p>See your lessons in <a href="https://rally-hub.com/app">RallyHUB</a>.</p>`,
        }],
      }),
    });
    emailed = res.ok;
    if (!res.ok) console.error('[notify-booking-change] sendgrid', res.status, await res.text());
  }

  return json({ pushed, emailed });
});
