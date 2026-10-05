import { pickNextUp, showCoachInvitePrompt, countdownLabel } from '@/lib/nextUp';

const now = new Date(2026, 9, 4, 10, 0); // Sun Oct 4 2026, 10:00 local
const T = (id: string, start: string, end = start) => ({ id, start_date: start, end_date: end });
const L = (id: string, starts: Date, status = 'accepted') => ({ id, starts_at: starts.toISOString(), status });

describe('pickNextUp (Home "Next up")', () => {
  it('a tournament in progress wins and is game day', () => {
    expect(pickNextUp([T('live', '2026-10-03', '2026-10-05'), T('later', '2026-10-10')], [L('l', new Date(2026, 9, 4, 18))], now))
      .toEqual({ kind: 'tournament', id: 'live', daysAway: 0, live: true, gameDay: true });
  });
  it('a lesson tonight beats a tournament next week', () => {
    expect(pickNextUp([T('t', '2026-10-10')], [L('l', new Date(2026, 9, 4, 18))], now)).toEqual({ kind: 'lesson', id: 'l', startsAt: new Date(2026, 9, 4, 18).toISOString() });
  });
  it('a tournament tomorrow beats a lesson tomorrow evening, and is game day', () => {
    expect(pickNextUp([T('t', '2026-10-05')], [L('l', new Date(2026, 9, 5, 18))], now))
      .toEqual({ kind: 'tournament', id: 't', daysAway: 1, live: false, gameDay: true });
  });
  it('a tournament 6 days out is not game day yet', () => {
    expect(pickNextUp([T('t', '2026-10-10')], [], now)).toMatchObject({ daysAway: 6, gameDay: false });
  });
  it('skips cancelled/declined and past lessons', () => {
    expect(pickNextUp([], [L('c', new Date(2026, 9, 5), 'cancelled'), L('p', new Date(2026, 9, 3))], now)).toBeNull();
    expect(pickNextUp([], [L('r', new Date(2026, 9, 6), 'requested')], now)).toMatchObject({ kind: 'lesson', id: 'r' });
  });
  it('ignores finished tournaments', () => {
    expect(pickNextUp([T('old', '2026-09-20', '2026-09-21')], [], now)).toBeNull();
  });
});

describe('showCoachInvitePrompt', () => {
  const base = { hasCoaches: false, lastInviteAt: null, dismissedAt: null, now };
  it('shows for families without a coach', () => expect(showCoachInvitePrompt(base)).toBe(true));
  it('hides once they have a coach', () => expect(showCoachInvitePrompt({ ...base, hasCoaches: true })).toBe(false));
  it('waits 30 days after an invite or a dismiss', () => {
    expect(showCoachInvitePrompt({ ...base, lastInviteAt: '2026-09-20T00:00:00Z' })).toBe(false);
    expect(showCoachInvitePrompt({ ...base, dismissedAt: '2026-08-01T00:00:00Z' })).toBe(true);
  });
});

it('countdown labels', () => {
  expect([0, 1, 5].map(countdownLabel)).toEqual(['Today', 'Tomorrow', 'In 5 days']);
});

import { groupByMonth } from '@/lib/nextUp';
describe('groupByMonth (Home "Coming up")', () => {
  it('splits a sorted timeline into month sections, year shown when it changes', () => {
    const g = groupByMonth([{ date: '2026-11-13' }, { date: '2026-11-20' }, { date: '2026-12-01' }, { date: '2027-01-02' }], new Date(2026, 9, 4));
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['NOVEMBER', 2], ['DECEMBER', 1], ['JANUARY 2027', 1]]);
  });
  it('handles an empty list', () => expect(groupByMonth([])).toEqual([]));
});
