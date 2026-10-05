import { parseSchoolSchedule, normalizeGames, inferYmd, toMinutes, splitOpponentLocation, gameTitle } from '@/lib/scheduleGames';
import { applyTemplate, fillTemplate } from '../../supabase/functions/_shared/templates';

// Sara's pasted school schedule (Oct 2026 → fall 2026 / spring 2027).
const PASTE = `11/13 Fri. Stony Point Stony Point 5:00 b 5:30 7:00
11/14 Sat. SA Stevens ---- ---- ---- 11:30
11/17 Tue. Rouse 5:15 b ---- 5:30 7:00
11/19-11/21 Thu.-Sat. Marble Falls Tourn ---- ---- ----
11/24 Tue. McNeil 11:00 b **12:15 b 11:30 1:00
12/1 Tue. Brentwood Christian **5:15 b ---- 5:30 7:00
12/3-12/5 Thu.-Sat. South San Tournament ---- ---- ----
12/3-12/5 Thu.-Sat. Buda Johnson Tournament Johnson HS ---- ----
12/8 Tue. Vista Ridge 5:15 b 6:30 b 5:30 7:00
12/12 Sat. LASA 11:15 10:00 12:30 2:00
12/18 Fri. 5:15 b 6:30 b 5:30 7:00
12/21 Mon. Gateway Prep 11:00 ---- 12:15 1:30
12/28-12/29 Hays Classic Hays HS ---- ---- ----
1/2 Sat. Bowie Bowie 11:00 b 12:30 b 12:30 2:00
1/8 Fri. ----- ---- ---- ---- ----
1/9 Sat. ---- ---- ----
1/12 Tue. Del Valle Del Valle HS 5:15 b 6:30 b 5:30 7:00
1/22 Fri. Austin High Austin 5:15 b 6:30 b 5:30 7:00
2/6 Sat. ---- 11:30 / 12:45 ---- ----
2/12 Fri. Johnson Johnson 5:15 b 6:30 b 5:30 7:00`;

const today = new Date(2026, 9, 4);

describe('parseSchoolSchedule (AI fallback for pasted school schedules)', () => {
  const { games, tournaments } = parseSchoolSchedule(PASTE, today);

  it('finds the multi-day tournaments', () => {
    expect(tournaments.map((t) => [t.name, t.start_date, t.end_date, t.venue_name])).toEqual([
      ['Marble Falls Tournament', '2026-11-19', '2026-11-21', ''],
      ['South San Tournament', '2026-12-03', '2026-12-05', ''],
      ['Buda Johnson Tournament', '2026-12-03', '2026-12-05', 'Johnson HS'],
      ['Hays Classic', '2026-12-28', '2026-12-29', 'Hays HS'],
    ]);
  });

  it('finds games and skips dash-only rows', () => {
    expect(games).toHaveLength(14);
    expect(games.find((g) => g.date === '2027-01-08')).toBeUndefined();
    expect(games.find((g) => g.date === '2027-01-09')).toBeUndefined();
  });

  it('splits opponent and location, earliest time, flags review', () => {
    const sp = games[0];
    expect(sp).toMatchObject({ date: '2026-11-13', opponent: 'Stony Point', location: 'Stony Point', home_away: 'away', start_time: '17:00', needs_review: true });
    expect(sp.times).toBe('5:00 b 5:30 7:00');
    expect(games.find((g) => g.date === '2026-11-24')).toMatchObject({ opponent: 'McNeil', start_time: '11:00' });
    expect(games.find((g) => g.date === '2027-01-12')).toMatchObject({ opponent: 'Del Valle', location: 'Del Valle HS' });
    expect(games.find((g) => g.date === '2026-11-14')).toMatchObject({ opponent: 'SA Stevens', start_time: '11:30', needs_review: false });
  });

  it('keeps rows with times but no opponent as TBD games', () => {
    const tbd = games.find((g) => g.date === '2026-12-18')!;
    expect(tbd.opponent).toBe('');
    expect(tbd.needs_review).toBe(true);
    expect(gameTitle(tbd)).toBe('Game (opponent TBD)');
    expect(games.find((g) => g.date === '2027-02-06')).toMatchObject({ opponent: '', start_time: '11:30' });
  });

  it('puts January in the next calendar year', () => {
    expect(games.find((g) => g.opponent === 'Bowie')?.date).toBe('2027-01-02');
  });
});

describe('helpers', () => {
  it('inferYmd follows the Aug→Jul season', () => {
    expect(inferYmd(11, 13, today)).toBe('2026-11-13');
    expect(inferYmd(2, 12, today)).toBe('2027-02-12');
    expect(inferYmd(3, 1, new Date(2027, 1, 1))).toBe('2027-03-01');
  });
  it('toMinutes treats 1–6 as PM', () => {
    expect(toMinutes('5:15')).toBe(17 * 60 + 15);
    expect(toMinutes('**12:15')).toBe(12 * 60 + 15);
    expect(toMinutes('10:00')).toBe(600);
    expect(toMinutes('b')).toBeNull();
  });
  it('splitOpponentLocation', () => {
    expect(splitOpponentLocation('Austin High Austin')).toEqual({ opponent: 'Austin High', location: 'Austin' });
    expect(splitOpponentLocation('Brentwood Christian')).toEqual({ opponent: 'Brentwood Christian', location: '' });
  });
  it('gameTitle marks away games', () => {
    expect(gameTitle({ opponent: 'Rouse', home_away: '' })).toBe('vs Rouse');
    expect(gameTitle({ opponent: 'Bowie', home_away: 'away' })).toBe('@ Bowie');
  });
});

describe('normalizeGames (AI output)', () => {
  it('drops bad dates, fills start time from times, dedupes, sorts', () => {
    const g = normalizeGames([
      { date: '2026-12-08', opponent: 'vs Vista Ridge', times: '5:15 b 6:30 b 5:30 7:00' },
      { date: 'Dec 8', opponent: 'x' },
      { date: '2026-11-17', opponent: 'Rouse', start_time: '17:15', home_away: 'HOME' },
      { date: '2026-12-08', opponent: 'Vista Ridge', times: '5:15 b 6:30 b 5:30 7:00' },
    ]);
    expect(g.map((x) => [x.date, x.opponent, x.start_time, x.home_away])).toEqual([
      ['2026-11-17', 'Rouse', '17:15', 'home'],
      ['2026-12-08', 'Vista Ridge', '17:15', ''],
    ]);
    expect(g[1].needs_review).toBe(true);
    expect(normalizeGames(null)).toEqual([]);
  });
});

describe('notification templates', () => {
  const fb = { title: 'Fallback title', body: 'Fallback body', channels: ['push'] as ('push' | 'email')[] };
  it('fills variables and tidies empty ones', () => {
    expect(fillTemplate('{{athlete}}\'s lesson{{where}}. {{reason}}', { athlete: 'Drue', where: '' })).toBe("Drue's lesson.");
  });
  it('uses the admin template and its channels', () => {
    expect(applyTemplate({ title_template: 'Hi {{athlete}}', body_template: 'At {{time}}', channels: ['push', 'email'], is_active: true }, { athlete: 'Drue', time: '4 PM' }, fb))
      .toEqual({ title: 'Hi Drue', body: 'At 4 PM', push: true, email: true, source: 'template' });
  });
  it('falls back when the template is missing', () => {
    expect(applyTemplate(null, {}, fb)).toMatchObject({ title: 'Fallback title', push: true, email: false, source: 'fallback' });
  });
  it('sends nothing when the admin turned it off', () => {
    expect(applyTemplate({ title_template: 'x', body_template: 'y', channels: ['push'], is_active: false }, {}, fb))
      .toMatchObject({ push: false, email: false, source: 'off' });
  });
});
