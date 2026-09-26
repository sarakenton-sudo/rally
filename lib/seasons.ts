import { supabase } from '@/lib/supabase';
import type { Season } from '@/types/database';

// Club volleyball seasons run August → July. Everything here is derived from
// dates — never hard-code a season year.

const ymdParts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];

/** "2026-2027" for any date from Aug 2026 through Jul 2027. */
export function seasonLabelFor(ymd: string): string {
  const [y, m] = ymdParts(ymd);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Season label for today (e.g. default for a new team). */
export function currentSeasonLabel(now = new Date()): string {
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return seasonLabelFor(ymd);
}

/** Season label for a batch of tournaments — the season most of them fall in. */
export function seasonLabelForDates(dates: string[]): string | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!valid.length) return null;
  const counts = new Map<string, number>();
  for (const d of valid) {
    const l = seasonLabelFor(d);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** 4-digit years mentioned in a free-text season_year ("2026-2027", "2026-27", "2027"). */
function yearsIn(seasonYear: string): number[] {
  const full = (seasonYear.match(/\d{4}/g) ?? []).map(Number);
  const short = seasonYear.match(/^(\d{4})\s*[-–\/]\s*(\d{2})$/);
  if (short) full.push(Math.floor(Number(short[1]) / 100) * 100 + Number(short[2]));
  return [...new Set(full)];
}

/** Does this team's season_year describe the given "YYYY-YYYY" season? */
export function seasonMatches(season: Season, label: string): boolean {
  const [a, b] = label.split('-').map(Number);
  const ys = yearsIn(season.season_year ?? '');
  if (!ys.length) return false;
  return ys.length >= 2 ? ys.includes(a) && ys.includes(b) : ys.includes(a) || ys.includes(b);
}

/**
 * Best existing team for tournaments on these dates, or null if none fits
 * (→ the parent should create the new team). Prefers the active team.
 */
export function guessSeason(seasons: Season[], dates: string[], activeSeasonId: string | null): Season | null {
  const label = seasonLabelForDates(dates);
  if (!label) return seasons.find((s) => s.id === activeSeasonId) ?? null;
  const matches = seasons.filter((s) => seasonMatches(s, label));
  return matches.find((s) => s.id === activeSeasonId) ?? matches[0] ?? null;
}

export interface NewTeamInput {
  athleteId: string;
  teamName: string;
  clubName: string;
  seasonYear: string;
  teamCode?: string;
}

/** Create a team (season row) and return it. */
export async function createSeason(input: NewTeamInput): Promise<{ data: Season | null; error: Error | null }> {
  const { data, error } = await (supabase.from('seasons') as any)
    .insert({
      athlete_id: input.athleteId,
      team_name: input.teamName.trim(),
      club_name: input.clubName.trim() || null,
      season_year: input.seasonYear.trim(),
      sport: 'volleyball',
      team_code: input.teamCode?.trim() || null,
      is_active: true,
    })
    .select()
    .single();
  return { data: (data as Season | null) ?? null, error: error ?? null };
}
