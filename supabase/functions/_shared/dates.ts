// Date context for every AI extraction prompt. Without it Claude guesses the
// year (prompts once hard-coded "2025-2026"), so a 2026-27 schedule listing
// "12-Dec FAST WU" landed on Dec 2025 and matched last season's tournament.

/** Club volleyball seasons run August → July. */
export function currentSeason(now = new Date()): { startYear: number; endYear: number } {
  const y = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 7 ? y : y - 1; // Aug (7) or later = new season
  return { startYear, endYear: startYear + 1 };
}

export function dateContext(now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const { startYear, endYear } = currentSeason(now);
  return `DATE CONTEXT (use this — do not guess):
- Today is ${today}.
- The current club volleyball season is ${startYear}-${endYear} (August ${startYear} through July ${endYear}).
- When a date has no year: Aug-Dec dates are ${startYear}, Jan-Jul dates are ${endYear}.
- Schedules, confirmations and announcements describe UPCOMING events. Never assign a year that puts an event more than 60 days before today unless the text explicitly states that year.
- An explicit year in the text always wins.`;
}
