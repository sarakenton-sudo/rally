// Date context for every AI extraction prompt. The model doesn't know today's
// date unless told, so it guessed years (an old prompt hard-coded a season).
// Nothing here is year-specific: only today's date is injected, and the rules
// tell the model to reason from it.

export function dateContext(now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  return `DATE CONTEXT — today is ${today}.
- If the text states a year, use it. A two-digit year "YY" means 20YY.
- If a date has no year, pick the year that makes it the NEXT upcoming occurrence on or after today. (Only use a past year if the text clearly describes something that already happened, e.g. a receipt for a completed stay.)
- Schedules and itineraries are chronological: when a list runs past December into January, the year increases. Never make a later item in a list come before an earlier one.
- Weekday names ("Sat, Dec 12") can confirm the year: prefer the year where that date falls on that weekday.`;
}
