// notify-booking-change: lesson changes → push + email + in-app (notification_log).
//   Coach → family:  'cancelled' | 'rescheduled' | 'booked' | 'reschedule_proposed'
//                    'coach_accepted_reschedule' | 'coach_declined_reschedule' (answers to the family)
//   Family → coach:  'reschedule_accepted' | 'reschedule_declined' (answers to the coach)
//                    'parent_cancelled' | 'parent_reschedule_proposed' (00082)
//   POST { booking_id, change }  (JWT: the booking's coach, or the family for the replies)
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
  const TO_FAMILY = ['cancelled', 'rescheduled', 'booked', 'reschedule_proposed', 'coach_accepted_reschedule', 'coach_declined_reschedule'];
  const TO_COACH = ['reschedule_accepted', 'reschedule_declined', 'parent_cancelled', 'parent_reschedule_proposed'];
  if (!booking_id || ![...TO_FAMILY, ...TO_COACH].includes(change)) return json({ error: 'bad request' }, 400);

  const { data: b } = await supabaseAdmin
    .from('bookings')
    .select('id, coach_id, parent_user_id, athlete_id, change_reason, proposal_reason, coaches(user_id, display_name, default_timezone), athletes(first_name), slots:slot_id(starts_at, facilities(label, address)), proposed:proposed_slot_id(starts_at, facilities(label, address))')
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
    case 'reschedule_declined':
      title = `${athlete}'s family kept the original time`; body = `The lesson stays at ${when}. The time you offered is open again.`; pushType = 'reschedule_answered'; break;
    case 'parent_cancelled':
      title = `${athlete}'s family cancelled a lesson`; body = `The lesson on ${when} is cancelled and that time is open again.${reason}`; pushType = 'family_lesson_cancelled'; break;
    case 'parent_reschedule_proposed': {
      const why = bk.proposal_reason ? `\n"${bk.proposal_reason}"` : '';
      const pw = placeOf(bk.proposed);
      title = `${athlete}'s family asked to move a lesson`;
      body = `From ${when} to ${proposedWhen}${pw ? ` · ${pw}` : ''}. Accept the new time or keep the original.${why}`;
      pushType = 'family_reschedule_proposed'; categoryId = 'family_reschedule_request';
      break;
    }
    case 'coach_accepted_reschedule':
      title = `${coach} accepted your new time`; body = `${athlete}'s lesson is now ${when}${where ? ` · ${where}` : ''}.`; pushType = 'lesson_changed'; break;
    default: // coach_declined_reschedule
      title = `${coach} kept the original time`; body = `${athlete}'s lesson stays at ${when}${where ? ` · ${where}` : ''}.`; pushType = 'lesson_changed';
  }

  const recipientId: string = toCoach ? bk.coaches.user_id : bk.parent_user_id;

  // Admin-editable copy (00084 templates); the text above is the fallback.
  const SLUG: Record<string, string> = {
    cancelled: 'lesson_cancelled', booked: 'lesson_booked_by_coach', rescheduled: 'lesson_moved',
    reschedule_proposed: 'reschedule_proposed', reschedule_accepted: 'reschedule_accepted', reschedule_declined: 'reschedule_declined',
    parent_cancelled: 'lesson_cancelled_by_family', parent_reschedule_proposed: 'reschedule_proposed_by_family',
    coach_accepted_reschedule: 'reschedule_accepted_by_coach', coach_declined_reschedule: 'reschedule_declined_by_coach',
  };
  const reasonText = change.includes('reschedule_proposed') ? bk.proposal_reason : bk.change_reason;
  const tpl = await renderNotification(supabaseAdmin, SLUG[change], {
    coach, athlete, when, where: where ? ` · ${where}` : '',
    proposed_when: proposedWhen, proposed_where: placeOf(bk.proposed) ? ` · ${placeOf(bk.proposed)}` : '',
    reason: reasonText ? `"${reasonText}"` : '',
  }, { title, body, channels: ['push', 'email'] });
  if (tpl.source === 'off') return json({ pushed: 0, emailed: false, email_status: 'off in admin' });
  title = tpl.title; body = tpl.body;

  // In-app: the notifications screen reads notification_log (always written).
  await supabaseAdmin.from('notification_log').insert({
    user_id: recipientId, notification_type: 'schedule_change', channel: 'push',
    message: `${title}. ${body.replace(/\n/g, ' ')}`, status: 'sent',
  }).then(({ error }) => { if (error) console.error('[notify-booking-change] log', error.message); });

  // Coach's Business → Notifications (00089): for themselves, or for all their clients.
  const { data: cns } = await supabaseAdmin.from('coach_notification_settings').select('self, clients').eq('coach_id', bk.coach_id).maybeSingle();
  const off = (scope: 'self' | 'clients', k: string) => (cns as any)?.[scope]?.[k] === false;
  const coachKey: Record<string, string> = { parent_cancelled: 'family_cancelled', parent_reschedule_proposed: 'family_reschedule', reschedule_accepted: 'family_reschedule', reschedule_declined: 'family_reschedule' };
  if (toCoach ? off('self', coachKey[change] ?? '') : off('clients', 'lesson_changes')) {
    return json({ pushed: 0, emailed: false, email_status: 'off in coach settings' });
  }

  // Families can turn off lesson-change push/email in Settings → Notifications (00083).
  if (!toCoach) {
    const { data: pref } = await supabaseAdmin.from('coaching_notification_prefs').select('lesson_changes').eq('user_id', recipientId).maybeSingle();
    if ((pref as any)?.lesson_changes === false) return json({ pushed: 0, emailed: false, email_status: 'family turned off lesson changes' });
  }

  let pushed = 0;
  const { data: tokens } = tpl.push ? await supabaseAdmin.from('push_tokens').select('token').eq('user_id', recipientId) : { data: [] as { token: string }[] };
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
  let emailStatus: number | string = tpl.email ? 'no address' : 'email off in admin';
  if (tpl.email) {
    const { data: recipient } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    const email = recipient?.user?.email;
    if (email) {
      const isProposal = change === 'reschedule_proposed' || change === 'parent_reschedule_proposed';
      const r = await sendEmail(SENDGRID_API_KEY, email, title, emailHtml(body,
        isProposal ? { label: 'Accept or keep the original in RallyHUB', url: 'https://rally-hub.com/app' } : undefined,
        isProposal ? `Until you answer, the lesson stays at ${when}.` : undefined));
      emailed = r === true;
      emailStatus = r === true ? 202 : r; // SendGrid's reason on failure (no secrets)
    }
  }

  return json({ pushed, emailed, email_status: emailStatus });
});
