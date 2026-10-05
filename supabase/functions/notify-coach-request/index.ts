// notify-coach-request: tell the coach (push + email) when a parent requests
// (or instant-books) a lesson. Called by the parent's app right after
// request_booking succeeds. Wording/channels: notification_templates
// 'booking_request_coach' / 'booking_confirmed_coach' (admin-editable).
//   POST { request_id }   (JWT required — caller must be the request's parent)
// Pending requests use the 'booking_request' notification category, which the
// app registers with Approve / Decline action buttons.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderNotification, emailHtml, sendEmail } from '../_shared/templates.ts';

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await supabaseAdmin.auth.getUser(jwt);
  const callerId = auth?.user?.id;
  if (!callerId) return json({ error: 'auth required' }, 401);

  const { request_id } = await req.json().catch(() => ({}));
  if (!request_id) return json({ error: 'request_id required' }, 400);

  const { data: r } = await supabaseAdmin
    .from('booking_requests')
    .select(`
      id, status, parent_user_id,
      coaches(user_id, default_timezone),
      athletes(first_name, last_name),
      session_types(name),
      slots(starts_at, facilities(label))
    `)
    .eq('id', request_id)
    .maybeSingle();
  // Only the requesting parent can trigger this, so it can't be used to spam coaches.
  if (!r || r.parent_user_id !== callerId) return json({ error: 'not found' }, 404);

  const req_ = r as any;
  const coachUserId: string | undefined = req_.coaches?.user_id;
  if (!coachUserId) return json({ sent: 0 });

  const tz = req_.coaches?.default_timezone || 'America/Chicago';
  const when = req_.slots?.starts_at
    ? new Date(req_.slots.starts_at).toLocaleString('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : 'Time TBD';
  const athlete = req_.athletes
    ? `${req_.athletes.first_name}${req_.athletes.last_name ? ' ' + req_.athletes.last_name[0] + '.' : ''}`
    : 'An athlete';
  const pending = r.status === 'requested';
  const details = [req_.session_types?.name, when, req_.slots?.facilities?.label].filter(Boolean).join(' · ');

  const tpl = await renderNotification(supabaseAdmin, pending ? 'booking_request_coach' : 'booking_confirmed_coach', {
    athlete, details, when, lesson_type: req_.session_types?.name ?? '', facility: req_.slots?.facilities?.label ?? '',
  }, {
    title: pending ? `Lesson request from ${athlete}` : `New booking: ${athlete}`,
    body: pending ? `${details}. Approve or decline in RallyHUB.` : details,
    channels: ['push', 'email'],
  });

  // Email too: the coach may not have the app installed.
  let emailed: boolean | string = false;
  if (tpl.email) {
    const { data: coachUser } = await supabaseAdmin.auth.admin.getUserById(coachUserId);
    const to = coachUser?.user?.email;
    if (to) {
      emailed = await sendEmail(SENDGRID_API_KEY, to, tpl.title, emailHtml(tpl.body, {
        label: pending ? 'Review the request' : 'See your schedule', url: 'https://rally-hub.com/today',
      }));
    }
  }

  const { data: tokens } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .eq('user_id', coachUserId);
  if (!tpl.push || !tokens?.length) {
    return json({ sent: 0, emailed, reason: tpl.push ? 'coach has no registered devices' : 'push turned off in admin' });
  }

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: tpl.title,
    // The long-press hint only makes sense on the push itself.
    body: pending ? `${tpl.body}\nHold to approve or decline.` : tpl.body,
    sound: 'default',
    data: { type: pending ? 'booking_request' : 'booking_confirmed', requestId: r.id },
    ...(pending ? { categoryId: 'booking_request' } : {}),
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);

  // Drop tokens Expo reports as dead (app deleted / permission revoked).
  const tickets: any[] = result?.data ?? [];
  const dead = tickets
    .map((t, i) => (t?.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter(Boolean);
  if (dead.length) await supabaseAdmin.from('push_tokens').delete().in('token', dead);

  return json({ sent: messages.length - dead.length, emailed });
});
