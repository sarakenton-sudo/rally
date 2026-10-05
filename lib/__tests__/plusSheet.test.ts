import { getPlusSheetOrder, findLessonPattern, type PlusContext, type PlusLesson } from '../plusSheet';

// Wed Oct 7 2026, 10:00 local
const NOW = new Date(2026, 9, 7, 10, 0);
const ymd = (daysFromNow: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Tuesdays at 6pm going back n weeks (Oct 6, Sep 29, Sep 22…)
const tuesdays = (n: number, coachId = 'maya', minuteJitter = 0): PlusLesson[] =>
  Array.from({ length: n }, (_, i) => ({
    coachId, coachName: 'Coach Maya', status: 'confirmed', sessionTypeId: 'private',
    startsAt: new Date(2026, 9, 6 - 7 * i, 18, minuteJitter).toISOString(),
  }));

const base = (over: Partial<PlusContext> = {}): PlusContext => ({
  now: NOW, tournaments: [], lessons: [], connectedCoachCount: 1, athleteCount: 1, seasonCount: 1, ...over,
});

describe('default', () => {
  it('travel → lesson → login when nothing applies', () => {
    const o = getPlusSheetOrder(base());
    expect(o.topItems).toEqual(['travel', 'lesson', 'login']);
    expect(o.rule).toBe('default');
    expect(o.setupPrompts).toEqual([]);
  });
});

describe('4.1 tournament imminent', () => {
  it('promotes travel when a tournament within 14 days needs travel', () => {
    const o = getPlusSheetOrder(base({ tournaments: [{ id: 't', name: 'Northern Lights', start_date: ymd(2), needsTravel: true }] }));
    expect(o.topItems[0]).toBe('travel');
    expect(o.rule).toBe('4.1');
    expect(o.travelSubtitle).toBe('Northern Lights · 2 days away');
  });
  it('ignores tournaments with travel booked or more than 14 days out', () => {
    const o = getPlusSheetOrder(base({ tournaments: [
      { id: 'a', name: 'Booked', start_date: ymd(3), needsTravel: false },
      { id: 'b', name: 'Far', start_date: ymd(20), needsTravel: true },
    ] }));
    expect(o.rule).toBe('default');
    expect(o.travelSubtitle).toBeNull();
  });
});

describe('4.2 lesson pattern', () => {
  it('promotes lessons with a rebook suggestion after 3 same-slot lessons', () => {
    const o = getPlusSheetOrder(base({ lessons: tuesdays(3) }));
    expect(o.topItems).toEqual(['lesson', 'travel', 'login']);
    expect(o.rule).toBe('4.2');
    expect(o.rebook).toMatchObject({ coachId: 'maya', weekday: 2, hour: 18 });
  });
  it('tolerates ±1 hour drift', () => {
    expect(findLessonPattern(tuesdays(3, 'maya', 45), NOW)).not.toBeNull();
  });
  it('needs at least 3 lessons', () => {
    expect(getPlusSheetOrder(base({ lessons: tuesdays(2) })).rule).toBe('default');
  });
  it('ignores cancelled lessons and lessons older than 6 weeks', () => {
    const cancelled = tuesdays(3).map((l) => ({ ...l, status: 'cancelled' }));
    const old = [8, 9, 10].map((w) => ({ ...tuesdays(1)[0], startsAt: new Date(2026, 9, 6 - 7 * w, 18).toISOString() }));
    expect(findLessonPattern([...cancelled, ...old], NOW)).toBeNull();
  });
});

describe('4.1 vs 4.2 tie-break', () => {
  const lessons = tuesdays(3);
  it('tournament within 3 days wins', () => {
    const o = getPlusSheetOrder(base({ lessons, tournaments: [{ id: 't', name: 'NL', start_date: ymd(3), needsTravel: true }] }));
    expect(o.topItems[0]).toBe('travel');
    expect(o.rule).toBe('4.1');
    expect(o.rebook).not.toBeNull(); // still offered inside Book a lesson
  });
  it('otherwise the lesson pattern wins', () => {
    const o = getPlusSheetOrder(base({ lessons, tournaments: [{ id: 't', name: 'NL', start_date: ymd(10), needsTravel: true }] }));
    expect(o.topItems[0]).toBe('lesson');
    expect(o.rule).toBe('4.2');
  });
});

describe('4.3 new user', () => {
  it('prompts for missing athlete and season', () => {
    const o = getPlusSheetOrder(base({ athleteCount: 0, seasonCount: 0 }));
    expect(o.setupPrompts).toEqual(['add_athlete', 'add_season']);
    expect(o.rule).toBe('4.3');
  });
  it('removes prompts once set up', () => {
    expect(getPlusSheetOrder(base()).setupPrompts).toEqual([]);
  });
});

describe('4.4 no coach connected', () => {
  it('never promotes lessons for a family with no coach', () => {
    const o = getPlusSheetOrder(base({ connectedCoachCount: 0, lessons: tuesdays(4) }));
    expect(o.topItems).toEqual(['travel', 'lesson', 'login']);
    expect(o.topItems.indexOf('lesson')).toBe(1);
    expect(o.rebook).toBeNull();
  });
});
