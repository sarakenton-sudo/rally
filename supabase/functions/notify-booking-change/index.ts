// notify-booking-change: lesson changes → push + email + in-app (notification_log).
//   Coach → family:  'cancelled' | 'rescheduled' | 'booked' | 'reschedule_proposed'
//   Family → coach:  'reschedule_accepted' | 'reschedule_declined'
//   POST { booking_id, change }  (JWT: the booking's coach, or the family for the replies)
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
  const TO_FAMILY = ['cancelled', 'rescheduled', 'booked', 'reschedule_proposed'];
  const TO_COACH = ['reschedule_accepted', 'reschedule_declined'];
  if (!booking_id || ![...TO_FAMILY, ...TO_COACH].includes(change)) return json({ error: 'bad request' }, 400);

  const { data: b } = await supabaseAdmin
    .from('bookings')
    .select('id, parent_user_id, athlete_id, change_reason, proposal_reason, coaches(user_id, display_name, default_timezone), athletes(first_name), slots:slot_id(starts_at, facilities(label, address)), proposed:proposed_slot_id(starts_at, facilities(label, address))')
    .eq('id', booking_id)
    .maybeSingle();
  const bk = b as any;
  if (!bk) return json({ error: 'not found' }, 404);
  const toCoach = TO_COACH.includes(change);
  if (toCoach) {
    // The family answers: the parent who booked, or a co-parent who manages the athlete.
    const { data: mgr } = await supabaseAdmin.from('admin_athletes').select('admin_id')
      .eq('athlete_id', bk.athlete_id).eq('admin_id', callerId).eq('permission', 'manage').maybeSingle();
    if (bk.parent_user_id !== callerId && !mgr) return json({ error: 'not found' }, 404);
  } else if (bk.coaches?.user_id !== callerId) {
    return json({ error: 'not found' }, 404);
  }

  const tz = bk.coaches?.default_timezone || 'America/Chicago';
  const fmt = (iso?: string) => iso
    ? new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const when = fmt(bk.slots?.starts_at);
  const proposedWhen = fmt(bk.proposed?.starts_at);
  const coach = bk.coaches?.display_name ?? 'Your coach';
  const athlete = bk.athletes?.first_name ?? 'your athlete';
  const placeOf = (s: any) => [s?.facilities?.label, s?.facilities?.address].filter(Boolean).join(', ');
  const where = placeOf(bk.slots);
  const reason = bk.change_reason ? `\n"${bk.change_reason}"` : '';

  let title: string, body: string, pushType: string, categoryId: string | undefined;
  switch (change) {
    case 'cancelled':
      title = `${coach} cancelled ${athlete}'s lesson`; body = `The lesson on ${when} is cancelled.${reason}`; pushType = 'lesson_changed'; break;
    case 'booked':
      title = `${coach} booked a lesson for ${athlete}`; body = `${when}${where ? ` · ${where}` : ''}. It's on your RallyHUB calendar.`; pushType = 'lesson_changed'; break;
    case 'rescheduled':
      title = `${coach} moved ${athlete}'s lesson`; body = `New time: ${when}${where ? ` · ${where}` : ''}.${reason}`; pushType = 'lesson_changed'; break;
    case 'reschedule_proposed': {
      const why = bk.proposal_reason ? `\n"${bk.proposal_reason}"` : '';
      const pw = placeOf(bk.proposed);
      title = `${coach} asked to move ${athlete}'s lesson`;
      body = `From ${when} to ${proposedWhen}${pw ? ` · ${pw}` : ''}. Accept the new time or keep the original.${why}`;
      pushType = 'reschedule_proposed'; categoryId = 'reschedule_proposal';
      break;
    }
    case 'reschedule_accepted':
      title = `${athlete}'s family accepted the new time`; body = `The lesson is now ${when}${where ? ` · ${where}` : ''}.`; pushType = 'reschedule_answered'; break;
    default:
      title = `${athlete}'s family kept the original time`; body = `The lesson stays at ${when}. The time you offered is open again.`; pushType = 'reschedule_answered';
  }

  const recipientId: string = toCoach ? bk.coaches.user_id : bk.parent_user_id;

  // In-app: the notifications screen reads notification_log.
  await supabaseAdmin.from('notification_log').insert({
    user_id: recipientId, notification_type: 'schedule_change', channel: 'push',
    message: `${title}. ${body.replace(/\n/g, ' ')}`, status: 'sent',
  }).then(({ error }) => { if (error) console.error('[notify-booking-change] log', error.message); });

  let pushed = 0;
  const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', recipientId);
  if (tokens?.length) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({
        to: token, title, body, sound: 'default',
        ...(categoryId ? { categoryId } : {}),
        data: { type: pushType, bookingId: bk.id },
      }))),
    }).catch((e) => console.error('[notify-booking-change] push', e));
    pushed = tokens.length;
  }

  let emailed = false;
  let emailStatus: number | string = SENDGRID_API_KEY ? 'no address' : 'no key';
  const { data: recipient } = await supabaseAdmin.auth.admin.getUserById(recipientId);
  const email = recipient?.user?.email;
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
          value: `<p>${esc(body).replace(/\n/g, '<br>')}</p>${change === 'reschedule_proposed'
            ? `<p><a href="https://rally-hub.com/app" style="display:inline-block;background:#3B82B0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Accept or keep the original in RallyHUB</a></p><p style="color:#6B8BA8;font-size:13px">Until you answer, the lesson stays at ${esc(when)}.</p>`
            : `<p>See your lessons in <a href="https://rally-hub.com/app">RallyHUB</a>.</p>`}`,
        }],
      }),
    });
    emailed = res.ok;
    emailStatus = res.status;
    if (!res.ok) {
      const detail = await res.text();
      console.error('[notify-booking-change] sendgrid', res.status, detail);
      // SendGrid's reason (no secrets) so the caller can see why email failed.
      try { emailStatus = `${res.status}: ${JSON.parse(detail).errors?.[0]?.message ?? ''}`; } catch { /* keep status */ }
    }
  }

  return json({ pushed, emailed, email_status: emailStatus });
});
