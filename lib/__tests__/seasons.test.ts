import { seasonLabelFor, currentSeasonLabel, seasonLabelForDates, seasonMatches, guessSeason } from '@/lib/seasons';
import type { Season } from '@/types/database';

const team = (id: string, season_year: string) => ({ id, season_year } as unknown as Season);

describe('season labels (Aug → Jul, never hard-coded)', () => {
  it('splits at August', () => {
    expect(seasonLabelFor('2026-07-31')).toBe('2025-2026');
    expect(seasonLabelFor('2026-08-01')).toBe('2026-2027');
    expect(seasonLabelFor('2027-01-15')).toBe('2026-2027');
  });
  it('labels today', () => {
    expect(currentSeasonLabel(new Date(2026, 9, 4))).toBe('2026-2027');
    expect(currentSeasonLabel(new Date(2031, 2, 1))).toBe('2030-2031');
  });
  it('uses the season most dates fall in', () => {
    expect(seasonLabelForDates(['2026-12-05', '2027-02-10', '2027-08-20'])).toBe('2026-2027');
    expect(seasonLabelForDates(['bad'])).toBeNull();
  });
});

describe('seasonMatches', () => {
  it('reads full, short and single-year team labels', () => {
    expect(seasonMatches(team('a', '2026-2027'), '2026-2027')).toBe(true);
    expect(seasonMatches(team('a', '2026-27'), '2026-2027')).toBe(true);
    expect(seasonMatches(team('a', '2027'), '2026-2027')).toBe(true);
    expect(seasonMatches(team('a', '2025-2026'), '2026-2027')).toBe(false);
    expect(seasonMatches(team('a', '14 Black'), '2026-2027')).toBe(false);
  });
});

describe('guessSeason (team picker default, P-14)', () => {
  const old = team('old', '2025-2026');
  const cur = team('cur', '2026-2027');
  const cur2 = team('cur2', '2026-27');
  it('picks the team whose season fits the dates', () => {
    expect(guessSeason([old, cur], ['2026-11-07'], 'old')?.id).toBe('cur');
  });
  it('prefers the active team when several fit', () => {
    expect(guessSeason([cur, cur2], ['2027-03-01'], 'cur2')?.id).toBe('cur2');
  });
  it('returns null when no team fits, so the parent creates one', () => {
    expect(guessSeason([old], ['2026-11-07'], 'old')).toBeNull();
  });
  it('falls back to the active team when there are no dates', () => {
    expect(guessSeason([old, cur], [], 'old')?.id).toBe('old');
  });
});
