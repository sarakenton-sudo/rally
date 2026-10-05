import {
  localParts, isQuietHour, dayWord, parentReminderAction, coachHeadsUpDue, morningSummaryDue, eveningNudgeDue,
  needsUnpaidNudge, parentReminderText, morningSummaryText, unpaidNudgeText, coachHeadsUpText,
} from '../../supabase/functions/_shared/reminders';

const TZ = 'America/Chicago';
const H = 3_600_000;
// 2026-10-05 15:00 UTC = 10:00 AM Chicago (CDT, UTC-5)
const now = new Date('2026-10-05T15:00:00Z');
const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * H);

describe('local time helpers', () => {
  it('reads date and hour in the coach timezone', () => {
    expect(localParts(now, TZ)).toEqual({ ymd: '2026-10-05', hour: 10, minute: 0 });
    expect(localParts(new Date('2026-10-05T03:30:00Z'), TZ).ymd).toBe('2026-10-04');
  });
  it('quiet hours are 10pm–7am', () => {
    expect(isQuietHour(now, TZ)).toBe(false);
    expect(isQuietHour(new Date('2026-10-05T04:00:00Z'), TZ)).toBe(true); // 11pm
    expect(isQuietHour(new Date('2026-10-05T11:30:00Z'), TZ)).toBe(true); // 6:30am
  });
  it('says today / tomorrow / weekday', () => {
    expect(dayWord(now, at(5), TZ)).toBe('today');
    expect(dayWord(now, at(24), TZ)).toBe('tomorrow');
    expect(dayWord(now, at(72), TZ)).toBe('Thursday');
  });
});

describe('parent reminders', () => {
  const booked = (startsAt: Date, o: Partial<{ sent24h: boolean; sent2h: boolean; createdAt: Date }> = {}) =>
    ({ startsAt, createdAt: new Date(startsAt.getTime() - 7 * 24 * H), sent24h: false, sent2h: false, ...o });

  it('sends the 24h reminder a day ahead', () => {
    expect(parentReminderAction(now, booked(at(24)), TZ)).toBe('send_24h');
    expect(parentReminderAction(now, booked(at(30)), TZ)).toBeNull();
  });
  it('sends the 2h reminder once', () => {
    expect(parentReminderAction(now, booked(at(1.5), { sent24h: true }), TZ)).toBe('send_2h');
    expect(parentReminderAction(now, booked(at(1.5), { sent24h: true, sent2h: true }), TZ)).toBeNull();
  });
  it('skips the 24h reminder for a lesson booked within a day', () => {
    expect(parentReminderAction(now, booked(at(10), { createdAt: at(-1) }), TZ)).toBe('skip_24h');
  });
  it('skips a 24h reminder that would land within 6h of the lesson', () => {
    expect(parentReminderAction(now, booked(at(4)), TZ)).toBe('skip_24h');
  });
  it('waits for morning instead of sending the 24h reminder overnight', () => {
    const night = new Date('2026-10-05T04:00:00Z'); // 11pm
    const lesson = new Date(night.getTime() + 20 * H);
    expect(parentReminderAction(night, booked(lesson), TZ)).toBeNull();
  });
  it('drops the 2h reminder overnight', () => {
    const early = new Date('2026-10-05T10:30:00Z'); // 5:30am, lesson 7am
    expect(parentReminderAction(early, booked(new Date(early.getTime() + 1.5 * H), { sent24h: true }), TZ)).toBe('skip_2h');
  });
  it('ignores past lessons', () => {
    expect(parentReminderAction(now, booked(at(-1)), TZ)).toBeNull();
  });
});

describe('coach timing', () => {
  it('heads-up within the hour, once', () => {
    expect(coachHeadsUpDue(now, at(0.75), false)).toBe(true);
    expect(coachHeadsUpDue(now, at(0.75), true)).toBe(false);
    expect(coachHeadsUpDue(now, at(2), false)).toBe(false);
  });
  it('morning summary once per local day, 7–11am', () => {
    expect(morningSummaryDue(now, TZ, null)).toBe(true);
    expect(morningSummaryDue(now, TZ, '2026-10-05')).toBe(false);
    expect(morningSummaryDue(now, TZ, '2026-10-04')).toBe(true);
    expect(morningSummaryDue(at(3), TZ, null)).toBe(false); // 1pm
  });
  it('unpaid nudge once per local day, 8–10pm', () => {
    expect(eveningNudgeDue(at(10.5), TZ, null)).toBe(true); // 8:30pm
    expect(eveningNudgeDue(at(10.5), TZ, '2026-10-05')).toBe(false);
    expect(eveningNudgeDue(now, TZ, null)).toBe(false);
  });
});

describe('unpaid lessons', () => {
  const l = (o: Partial<Parameters<typeof needsUnpaidNudge>[1]> = {}) => ({
    status: 'confirmed', paymentStatus: 'pending', endsAt: at(-3), chargeDueAt: null, nudgeCount: 0, priceCents: 8000, ...o,
  });
  it('nudges recent unpaid lessons', () => expect(needsUnpaidNudge(now, l())).toBe(true));
  it('not paid, cancelled, upcoming, or old ones', () => {
    expect(needsUnpaidNudge(now, l({ paymentStatus: 'captured' }))).toBe(false);
    expect(needsUnpaidNudge(now, l({ status: 'cancelled' }))).toBe(false);
    expect(needsUnpaidNudge(now, l({ endsAt: at(1) }))).toBe(false);
    expect(needsUnpaidNudge(now, l({ endsAt: at(-50) }))).toBe(false);
  });
  it('not ones the app will charge automatically, unless the charge failed', () => {
    expect(needsUnpaidNudge(now, l({ chargeDueAt: at(2) }))).toBe(false);
    expect(needsUnpaidNudge(now, l({ chargeDueAt: at(-1), paymentStatus: 'failed' }))).toBe(true);
  });
  it('at most twice per lesson', () => {
    expect(needsUnpaidNudge(now, l({ nudgeCount: 1 }))).toBe(true);
    expect(needsUnpaidNudge(now, l({ nudgeCount: 2 }))).toBe(false);
  });
});

describe('wording', () => {
  it('parent reminders', () => {
    const v = { athlete: 'Drue', coach: 'Coach Ben', facility: 'Elevate Gym', now, tz: TZ };
    expect(parentReminderText('24h', { ...v, startsAt: at(32) })).toEqual({ title: "Drue's lesson with Coach Ben", body: 'Tomorrow at 6:00 PM · Elevate Gym' });
    expect(parentReminderText('2h', { ...v, startsAt: at(2), facility: null }).body).toBe('Starts in 2 hours, at 12:00 PM');
  });
  it('coach messages', () => {
    expect(morningSummaryText({ lessons: 3, firstAt: at(6), totalCents: 24000, tz: TZ })).toEqual({ title: '3 lessons today', body: 'First at 4:00 PM · $240' });
    expect(unpaidNudgeText({ lessons: 1, totalCents: 8050 }).title).toBe('1 lesson still unpaid ($80.50)');
    expect(coachHeadsUpText({ athletes: ['Drue', 'Mia', 'Ava'], facility: null, startsAt: at(1), tz: TZ }).title).toBe('Lesson with Drue, Mia +1 in 1 hour');
  });
});
