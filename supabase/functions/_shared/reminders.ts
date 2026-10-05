// Pure scheduling + wording for lesson reminders (lesson-reminders edge fn).
// No Deno or RN APIs here: jest tests this file directly (lib/__tests__/reminders.test.ts).

const HOUR = 3_600_000;

/** Local date ("2026-10-04") and hour (0–23) of `at` in a timezone. */
export function localParts(at: Date, tz: string): { ymd: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

/** No pushes from 10pm to 7am local. */
export const isQuietHour = (now: Date, tz: string) => {
  const { hour } = localParts(now, tz);
  return hour >= 22 || hour < 7;
};

export const fmtTime = (at: Date, tz: string) =>
  at.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

/** "today" / "tomorrow" / "Saturday", relative to `now` in the timezone. */
export function dayWord(now: Date, at: Date, tz: string): string {
  const a = localParts(now, tz).ymd, b = localParts(at, tz).ymd;
  if (a === b) return 'today';
  const tomorrow = localParts(new Date(now.getTime() + 24 * HOUR), tz).ymd;
  if (b === tomorrow) return 'tomorrow';
  return at.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
}

export type ParentAction = 'send_24h' | 'send_2h' | 'skip_24h' | 'skip_2h' | null;

/**
 * What to do for a parent's confirmed lesson on this sweep (runs every 15 min).
 * - 24h reminder: when the lesson is 2–26h away, outside quiet hours (deferred
 *   until morning otherwise). Skipped if booked within a day of the lesson
 *   (the family just got a confirmation) or if it's already within 6h.
 * - 2h reminder: 0–2h away. Skipped (not deferred) during quiet hours.
 */
export function parentReminderAction(
  now: Date,
  b: { startsAt: Date; createdAt: Date; sent24h: boolean; sent2h: boolean },
  tz: string,
): ParentAction {
  const until = b.startsAt.getTime() - now.getTime();
  if (until <= 0) return null;
  if (until <= 2 * HOUR) {
    if (b.sent2h) return null;
    return isQuietHour(now, tz) ? 'skip_2h' : 'send_2h';
  }
  if (until <= 26 * HOUR && !b.sent24h) {
    const bookedLate = b.startsAt.getTime() - b.createdAt.getTime() < 24 * HOUR;
    if (bookedLate || until <= 6 * HOUR) return 'skip_24h';
    return isQuietHour(now, tz) ? null : 'send_24h';
  }
  return null;
}

/** Coach heads-up: once, when the lesson is within the next hour. */
export const coachHeadsUpDue = (now: Date, startsAt: Date, sent: boolean) => {
  const until = startsAt.getTime() - now.getTime();
  return !sent && until > 0 && until <= HOUR;
};

/** Morning summary: once per local day, 7–11am. */
export function morningSummaryDue(now: Date, tz: string, lastSentYmd: string | null): boolean {
  const { ymd, hour } = localParts(now, tz);
  return hour >= 7 && hour < 11 && lastSentYmd !== ymd;
}

/** Unpaid-lessons nudge: once per local day, 8–10pm. */
export function eveningNudgeDue(now: Date, tz: string, lastSentYmd: string | null): boolean {
  const { ymd, hour } = localParts(now, tz);
  return hour >= 20 && hour < 22 && lastSentYmd !== ymd;
}

export interface UnpaidCandidate {
  status: string;
  paymentStatus: string;
  endsAt: Date;
  chargeDueAt: Date | null;
  nudgeCount: number;
  priceCents: number;
}

/**
 * Lessons worth nudging about: ended in the last 48h, not cancelled, unpaid,
 * not about to be charged automatically in the app (a failed charge counts),
 * nudged fewer than twice.
 */
export function needsUnpaidNudge(now: Date, l: UnpaidCandidate): boolean {
  if (!['confirmed', 'completed'].includes(l.status)) return false;
  if (!['pending', 'authorized', 'failed'].includes(l.paymentStatus)) return false;
  const ago = now.getTime() - l.endsAt.getTime();
  if (ago < 0 || ago > 48 * HOUR) return false;
  if (l.chargeDueAt && l.paymentStatus !== 'failed') return false;
  return l.nudgeCount < 2;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function parentReminderText(
  kind: '24h' | '2h',
  v: { athlete: string; coach: string; facility: string | null; startsAt: Date; now: Date; tz: string },
) {
  const where = v.facility ? ` · ${v.facility}` : '';
  const title = `${v.athlete}'s lesson with ${v.coach}`;
  const body = kind === '2h'
    ? `Starts in 2 hours, at ${fmtTime(v.startsAt, v.tz)}${where}`
    : `${dayWord(v.now, v.startsAt, v.tz).replace(/^./, (c) => c.toUpperCase())} at ${fmtTime(v.startsAt, v.tz)}${where}`;
  return { title, body };
}

export function coachHeadsUpText(v: { athletes: string[]; facility: string | null; startsAt: Date; tz: string }) {
  const who = v.athletes.length > 2 ? `${v.athletes.slice(0, 2).join(', ')} +${v.athletes.length - 2}` : v.athletes.join(' & ');
  return { title: `Lesson with ${who} in 1 hour`, body: `${fmtTime(v.startsAt, v.tz)}${v.facility ? ` · ${v.facility}` : ''}` };
}

export function morningSummaryText(v: { lessons: number; firstAt: Date; totalCents: number; tz: string }) {
  return {
    title: `${plural(v.lessons, 'lesson')} today`,
    body: `First at ${fmtTime(v.firstAt, v.tz)}${v.totalCents ? ` · ${money(v.totalCents)}` : ''}`,
  };
}

export function unpaidNudgeText(v: { lessons: number; totalCents: number }) {
  return {
    title: `${plural(v.lessons, 'lesson')} still unpaid (${money(v.totalCents)})`,
    body: 'Tap to record cash, Venmo, or Zelle.',
  };
}
