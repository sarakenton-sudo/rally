// Games (single matches) in pasted school / club schedules — alongside the
// tournaments the AI already reads. Pure logic, no React Native: tested in
// lib/__tests__/scheduleGames.test.ts.
//
// Typical school layout, one row per date:
//   11/13 Fri. Stony Point Stony Point 5:00 b 5:30 7:00      (opponent, location, level times)
//   11/19-11/21 Thu.-Sat. Marble Falls Tourn ---- ---- ----   (multi-day → tournament)
//   12/18 Fri. 5:15 b 6:30 b 5:30 7:00                         (no opponent → TBD)
//   1/8 Fri. ----- ---- ---- ---- ----                         (no game → skipped)

export interface ExtractedGame {
  date: string;              // YYYY-MM-DD
  opponent: string;          // '' when the row doesn't name one
  location: string;          // venue / school, '' if not given
  home_away: 'home' | 'away' | '';
  start_time: string;        // 'HH:MM' 24h (earliest listed), '' if none
  times: string;             // every time on the row, as written ("5:00 b 5:30 7:00")
  notes: string;
  needs_review: boolean;     // several times listed, or no opponent
}

export interface ParsedTournament {
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venue_name: string;
  venue_address: string;
  notes: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Season-aware year for a month/day with no year: Aug–Dec belong to the season
 * that started this fall, Jan–Jul to the following spring (club/school seasons
 * run Aug → Jul). Never hard-coded — derived from `today`.
 */
export function inferYmd(month: number, day: number, today: Date = new Date()): string {
  const seasonStart = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  const year = month >= 8 ? seasonStart : seasonStart + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const TIME_RE = /^\*{0,2}(\d{1,2}):(\d{2})\*{0,2}$/;

/** School games: 1:00–7:59 are afternoon/evening (varsity often 7:00 PM); 8–11 are morning; 12 is noon. */
export function toMinutes(raw: string): number | null {
  const m = raw.match(TIME_RE);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** "Stony Point Stony Point" → opponent "Stony Point", location "Stony Point" (repeated school name). */
export function splitOpponentLocation(text: string): { opponent: string; location: string } {
  const w = text.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return { opponent: '', location: '' };
  for (let k = 1; k < w.length; k++) {
    if (w[k].toLowerCase() === w[0].toLowerCase()) {
      return { opponent: w.slice(0, k).join(' '), location: w.slice(k).join(' ') };
    }
  }
  return { opponent: w.join(' '), location: '' };
}

const ROW_RE = /^\s*(\d{1,2})\/(\d{1,2})(?:\s*-\s*(\d{1,2})\/(\d{1,2}))?\s+(?:[A-Za-z]{3}\.?(?:\s*-\s*[A-Za-z]{3}\.?)?\s+)?(.*)$/;
const DASHES_RE = /^-{2,}$/;
const TOURNEY_RE = /\b(tourn(?:ament|ey)?|classic|invitational|invite|showcase|festival|cup)\b/i;

/** Parse a school/club schedule pasted as rows. Returns games and multi-day tournaments. */
export function parseSchoolSchedule(text: string, today: Date = new Date()): { games: ExtractedGame[]; tournaments: ParsedTournament[] } {
  const games: ExtractedGame[] = [];
  const tournaments: ParsedTournament[] = [];

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, m1, d1, m2, d2, restRaw] = m;
    const start = inferYmd(Number(m1), Number(d1), today);
    let end = m2 && d2 ? inferYmd(Number(m2), Number(d2), today) : start;
    if (end < start) end = start; // 12/28-1/2 style ranges are rare; never invert

    const tokens = restRaw.trim().split(/\s+/).filter(Boolean);
    // Name/opponent = words before the first time or dash token.
    const firstTimeOrDash = tokens.findIndex((t) => TIME_RE.test(t) || DASHES_RE.test(t) || t === '/');
    const nameWords = firstTimeOrDash === -1 ? tokens : tokens.slice(0, firstTimeOrDash);
    const rest = firstTimeOrDash === -1 ? [] : tokens.slice(firstTimeOrDash);
    const times = rest.filter((t) => TIME_RE.test(t));
    const nameText = nameWords.join(' ');

    // Multi-day rows, or rows naming a tournament, are tournaments.
    if (end !== start || TOURNEY_RE.test(nameText)) {
      if (!nameText) continue;
      const tm = nameText.match(/^(.*?\b(?:tourn(?:ament|ey)?|classic|invitational|invite|showcase|festival|cup)\b)\s*(.*)$/i);
      let name = tm ? tm[1] : nameText;
      let venue = tm ? tm[2] : '';
      if (!tm) {
        const split = splitOpponentLocation(nameText);
        name = split.opponent; venue = split.location;
      }
      name = name.replace(/\bTourn\b\.?$/i, 'Tournament').trim();
      tournaments.push({ name, start_date: start, end_date: end, location_city: '', venue_name: venue.trim(), venue_address: '', notes: '' });
      continue;
    }

    // Single day: a game if it has an opponent or any time; all dashes = no game.
    if (!nameText && !times.length) continue;
    const { opponent, location } = splitOpponentLocation(nameText);
    const mins = times.map(toMinutes).filter((n): n is number => n !== null);
    const earliest = mins.length ? Math.min(...mins) : null;
    games.push({
      date: start,
      opponent,
      location,
      home_away: location && opponent && location.toLowerCase().startsWith(opponent.split(' ')[0].toLowerCase()) ? 'away' : '',
      start_time: earliest === null ? '' : hhmm(earliest),
      times: rest.filter((t) => !DASHES_RE.test(t)).join(' ').replace(/\*/g, '').trim(),
      notes: '',
      needs_review: !opponent || times.length > 1,
    });
  }
  return { games, tournaments };
}

/** Clean up games returned by the AI (same shape; tolerate missing fields). */
export function normalizeGames(raw: unknown): ExtractedGame[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedGame[] = [];
  const seen = new Set<string>();
  for (const g of raw as any[]) {
    const date = typeof g?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : null;
    if (!date) continue;
    const times = String(g.times ?? '').trim();
    let start = String(g.start_time ?? '').trim();
    if (!/^\d{2}:\d{2}$/.test(start)) {
      const mins = times.split(/\s+/).map(toMinutes).filter((n): n is number => n !== null);
      start = mins.length ? hhmm(Math.min(...mins)) : '';
    }
    const opponent = String(g.opponent ?? '').trim().replace(/^(vs\.?|@)\s+/i, '');
    const ha = String(g.home_away ?? '').toLowerCase();
    const key = `${date}|${opponent.toLowerCase()}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date, opponent, location: String(g.location ?? '').trim(),
      home_away: ha === 'home' || ha === 'away' ? ha : '',
      start_time: start, times, notes: String(g.notes ?? '').trim(),
      needs_review: !!g.needs_review || !opponent || (times.match(/\d{1,2}:\d{2}/g) ?? []).length > 1,
    });
  }
  return out.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

/** Team-event title for a game. */
export const gameTitle = (g: Pick<ExtractedGame, 'opponent' | 'home_away'>) =>
  g.opponent ? `${g.home_away === 'away' ? '@' : 'vs'} ${g.opponent}` : 'Game (opponent TBD)';
