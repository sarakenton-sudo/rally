// lesson-reminders: called every 15 min by pg_cron (header x-cron-secret = CRON_SECRET).
//   Parents  — 24h (push + email) and 2h (push) before each confirmed lesson.
//   Coaches  — morning summary (7–11am local), 1h heads-up per lesson,
//              evening nudge (8–10pm local) about lessons that ended unpaid.
// Each send is claimed with a conditional UPDATE first, so overlapping or
// retried runs never double-send. Opt-out: coaching_notification_prefs
// (lesson_reminders=false or push_enabled=false).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parentReminderAction, coachHeadsUpDue, morningSummaryDue, eveningNudgeDue, needsUnpaidNudge, localParts,
  parentReminderText, coachHeadsUpText, morningSummaryText, unpaidNudgeText, fmtTime, dayWord,
} from '../_shared/reminders.ts';
import { renderNotification, emailHtml, sendEmail, type Fallback, type Vars } from '../_shared/templates.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEFAULT_TZ = 'America/Chicago';
const H = 3_600_000;

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

type Push = { userId: string; title: string; body: string; data: Record<string, unknown> };

/** Users who turned lesson reminders (or all coaching pushes) off. */
async function optedOut(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data } = await db.from('coaching_notification_prefs').select('user_id, lesson_reminders, push_enabled').in('user_id', userIds);
  return new Set((data ?? []).filter((p: any) => p.lesson_reminders === false || p.push_enabled === false).map((p: any) => p.user_id));
}

async function sendPushes(pushes: Push[]) {
  if (!pushes.length) return 0;
  const ids = [...new Set(pushes.map((p) => p.userId))];
  const { data: tokens } = await db.from('push_tokens').select('user_id, token').in('user_id', ids);
  const byUser = new Map<string, string[]>();
  for (const t of (tokens ?? []) as any[]) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  const messages = pushes.flatMap((p) => (byUser.get(p.userId) ?? []).map((to) => ({ to, title: p.title, body: p.body, sound: 'default', data: p.data })));
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch((e) => console.error('[lesson-reminders] push', e));
  }
  return messages.length;
}

async function email(userId: string, subject: string, text: string): Promise<boolean> {
  if (!SENDGRID_API_KEY) return false;
  const { data } = await db.auth.admin.getUserById(userId);
  const to = data?.user?.email;
  if (!to) return false;
  return (await sendEmail(SENDGRID_API_KEY, to, subject, emailHtml(text))) === true;
}

/**
 * Render a notification from its admin template (falls back to built-in copy),
 * then queue the push and/or send the email per the template's channels.
 */
async function notify(
  userId: string, slug: string, vars: Vars, fallback: Fallback, data: Record<string, unknown>,
  pushes: Push[], counts: { emails: number },
): Promise<boolean> {
  const r = await renderNotification(db, slug, vars, fallback);
  if (r.push) pushes.push({ userId, title: r.title, body: r.body, data });
  if (r.email && (await email(userId, r.title, r.body))) counts.emails++;
  return r.push || r.email;
}

/** Claim a boolean flag on a booking; true only for the run that flipped it. */
async function claim(bookingId: string, column: 'reminder_sent_24h' | 'reminder_sent_2h' | 'coach_reminder_sent') {
  const { data } = await db.from('bookings').update({ [column]: true }).eq('id', bookingId).eq(column, false).select('id');
  return (data ?? []).length > 0;
}

/** Claim a once-per-day coach send for local date `ymd`. */
async function claimCoachDay(coachId: string, column: 'last_summary_date' | 'last_unpaid_nudge_date', ymd: string) {
  const { data } = await db.from('coaches').update({ [column]: ymd }).eq('id', coachId)
    .or(`${column}.is.null,${column}.neq.${ymd}`).select('id');
  return (data ?? []).length > 0;
}

serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);

  const now = new Date();
  const pushes: Push[] = [];
  const counts = { parent24h: 0, parent2h: 0, coachHeadsUp: 0, summaries: 0, unpaidNudges: 0, emails: 0 };

  // ── Upcoming confirmed lessons (next 26h): parent reminders, coach heads-up, morning summary ──
  const { data: upcoming, error } = await db
    .from('bookings')
    .select(`
      id, parent_user_id, price_cents, created_at, reminder_sent_24h, reminder_sent_2h, coach_reminder_sent,
      coaches(id, user_id, display_name, default_timezone, last_summary_date),
      athletes(first_name),
      slots!inner(id, starts_at, facilities(label))
    `)
    .eq('status', 'confirmed')
    .gt('slots.starts_at', now.toISOString())
    .lte('slots.starts_at', new Date(now.getTime() + 26 * H).toISOString())
    .limit(1000);
  if (error) return json({ error: error.message }, 500);
  const rows = (upcoming ?? []) as any[];

  const out = await optedOut([...new Set(rows.flatMap((b) => [b.parent_user_id, b.coaches?.user_id]).filter(Boolean))]);

  // Parents
  for (const b of rows) {
    const tz = b.coaches?.default_timezone || DEFAULT_TZ;
    const startsAt = new Date(b.slots.starts_at);
    const action = parentReminderAction(now, {
      startsAt, createdAt: new Date(b.created_at), sent24h: b.reminder_sent_24h, sent2h: b.reminder_sent_2h,
    }, tz);
    if (!action) continue;
    const column = action.endsWith('24h') ? 'reminder_sent_24h' : 'reminder_sent_2h';
    if (!(await claim(b.id, column))) continue;
    // Within 2h the 24h reminder is moot: mark it too so it never fires late.
    if (column === 'reminder_sent_2h' && !b.reminder_sent_24h) await claim(b.id, 'reminder_sent_24h');
    if (action.startsWith('skip') || out.has(b.parent_user_id)) continue;

    const kind = action === 'send_24h' ? '24h' : '2h';
    const facility = b.slots.facilities?.label ?? null;
    const athlete = b.athletes?.first_name ?? 'Your athlete';
    const coachName = b.coaches?.display_name ?? 'your coach';
    const fb = parentReminderText(kind, { athlete, coach: coachName, facility, startsAt, now, tz });
    await notify(b.parent_user_id, kind === '24h' ? 'lesson_reminder_24h' : 'lesson_reminder_2h', {
      athlete, coach: coachName, time: fmtTime(startsAt, tz), where: facility ? ` · ${facility}` : '', facility: facility ?? '',
      day: dayWord(now, startsAt, tz).replace(/^./, (c) => c.toUpperCase()),
    }, { ...fb, channels: kind === '24h' ? ['push', 'email'] : ['push'] }, { type: 'lesson_reminder', bookingId: b.id }, pushes, counts);
    if (kind === '24h') counts.parent24h++; else counts.parent2h++;
  }

  // Coaches: group by coach, then by slot (a group lesson is one heads-up).
  const byCoach = new Map<string, { coach: any; bookings: any[] }>();
  for (const b of rows) {
    if (!b.coaches?.id) continue;
    const e = byCoach.get(b.coaches.id) ?? { coach: b.coaches, bookings: [] };
    e.bookings.push(b);
    byCoach.set(b.coaches.id, e);
  }
  for (const { coach, bookings } of byCoach.values()) {
    if (out.has(coach.user_id)) continue;
    const tz = coach.default_timezone || DEFAULT_TZ;

    // 1h heads-up per slot
    const bySlot = new Map<string, any[]>();
    for (const b of bookings) bySlot.set(b.slots.id, [...(bySlot.get(b.slots.id) ?? []), b]);
    for (const group of bySlot.values()) {
      const startsAt = new Date(group[0].slots.starts_at);
      const due = group.filter((b) => coachHeadsUpDue(now, startsAt, b.coach_reminder_sent));
      if (!due.length) continue;
      const claimed: any[] = [];
      for (const b of due) if (await claim(b.id, 'coach_reminder_sent')) claimed.push(b);
      if (!claimed.length) continue;
      const names = group.map((b) => b.athletes?.first_name ?? 'athlete');
      const facility = group[0].slots.facilities?.label ?? null;
      const fb = coachHeadsUpText({ athletes: names, facility, startsAt, tz });
      await notify(coach.user_id, 'coach_lesson_heads_up', {
        athletes: names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' & '),
        time: fmtTime(startsAt, tz), where: facility ? ` · ${facility}` : '', facility: facility ?? '',
      }, { ...fb, channels: ['push'] }, { type: 'coach_lesson_reminder', bookingId: claimed[0].id }, pushes, counts);
      counts.coachHeadsUp++;
    }

    // Morning summary of today's lessons
    if (morningSummaryDue(now, tz, coach.last_summary_date)) {
      const today = localParts(now, tz).ymd;
      const todays = bookings.filter((b) => localParts(new Date(b.slots.starts_at), tz).ymd === today);
      if (todays.length && (await claimCoachDay(coach.id, 'last_summary_date', today))) {
        const slots = new Set(todays.map((b) => b.slots.id));
        const firstAt = new Date(Math.min(...todays.map((b) => new Date(b.slots.starts_at).getTime())));
        const totalCents = todays.reduce((s, b) => s + (b.price_cents ?? 0), 0);
        const fb = morningSummaryText({ lessons: slots.size, firstAt, totalCents, tz });
        await notify(coach.user_id, 'coach_daily_summary', {
          lessons: plural(slots.size, 'lesson'), first_time: fmtTime(firstAt, tz),
          total: totalCents ? ` · ${money(totalCents)}` : '', amount: totalCents ? money(totalCents) : '',
        }, { ...fb, channels: ['push'] }, { type: 'coach_daily_summary' }, pushes, counts);
        counts.summaries++;
      }
    }
  }

  // ── Evening nudge: lessons that ended in the last 48h and are still unpaid ──
  const { data: unpaid } = await db
    .from('bookings')
    .select(`
      id, status, payment_status, price_cents, charge_due_at, unpaid_nudge_count,
      coaches(id, user_id, default_timezone, last_unpaid_nudge_date),
      slots!inner(ends_at)
    `)
    .in('status', ['confirmed', 'completed'])
    .in('payment_status', ['pending', 'authorized', 'failed'])
    .lt('unpaid_nudge_count', 2)
    .lte('slots.ends_at', now.toISOString())
    .gte('slots.ends_at', new Date(now.getTime() - 48 * H).toISOString())
    .limit(1000);
  const unpaidByCoach = new Map<string, { coach: any; lessons: any[] }>();
  for (const b of (unpaid ?? []) as any[]) {
    if (!b.coaches?.id) continue;
    const ok = needsUnpaidNudge(now, {
      status: b.status, paymentStatus: b.payment_status, endsAt: new Date(b.slots.ends_at),
      chargeDueAt: b.charge_due_at ? new Date(b.charge_due_at) : null, nudgeCount: b.unpaid_nudge_count, priceCents: b.price_cents,
    });
    if (!ok) continue;
    const e = unpaidByCoach.get(b.coaches.id) ?? { coach: b.coaches, lessons: [] };
    e.lessons.push(b);
    unpaidByCoach.set(b.coaches.id, e);
  }
  const unpaidOut = await optedOut([...unpaidByCoach.values()].map((e) => e.coach.user_id));
  for (const { coach, lessons } of unpaidByCoach.values()) {
    const tz = coach.default_timezone || DEFAULT_TZ;
    if (unpaidOut.has(coach.user_id) || !eveningNudgeDue(now, tz, coach.last_unpaid_nudge_date)) continue;
    if (!(await claimCoachDay(coach.id, 'last_unpaid_nudge_date', localParts(now, tz).ymd))) continue;
    for (const l of lessons) {
      await db.from('bookings').update({ unpaid_nudge_count: l.unpaid_nudge_count + 1 }).eq('id', l.id).eq('unpaid_nudge_count', l.unpaid_nudge_count);
    }
    const totalCents = lessons.reduce((s, l) => s + (l.price_cents ?? 0), 0);
    const fb = unpaidNudgeText({ lessons: lessons.length, totalCents });
    await notify(coach.user_id, 'coach_unpaid_nudge', {
      lessons: plural(lessons.length, 'lesson'), total: money(totalCents),
    }, { ...fb, channels: ['push', 'email'] }, { type: 'unpaid_lessons' }, pushes, counts);
    counts.unpaidNudges++;
  }

  const delivered = await sendPushes(pushes);
  return json({ ...counts, pushes: pushes.length, delivered });
});
