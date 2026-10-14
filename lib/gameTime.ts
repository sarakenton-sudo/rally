// Game times: the database stores "HH:MM[:SS]" (24h); people pick "6:30 PM".

/** Start-time choices, 6:00 AM to 10:45 PM in 15-minute steps. */
export const GAME_TIMES: string[] = Array.from({ length: 68 }, (_, i) => {
  const mins = 360 + i * 15;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
});

/** "18:30:00" → "6:30 PM" (or '' when unset). */
export function toLabel(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "6:30 PM" → "18:30" (or null for "No time"). */
export function fromLabel(label: string): string | null {
  const m = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// ---- Time zones (US) ----
export const GAME_ZONES: { tz: string; label: string; short: string }[] = [
  { tz: 'America/New_York', label: 'Eastern (ET)', short: 'ET' },
  { tz: 'America/Chicago', label: 'Central (CT)', short: 'CT' },
  { tz: 'America/Denver', label: 'Mountain (MT)', short: 'MT' },
  { tz: 'America/Phoenix', label: 'Arizona (MST)', short: 'AZ' },
  { tz: 'America/Los_Angeles', label: 'Pacific (PT)', short: 'PT' },
  { tz: 'America/Anchorage', label: 'Alaska (AKT)', short: 'AKT' },
  { tz: 'Pacific/Honolulu', label: 'Hawaii (HT)', short: 'HT' },
];

/** The phone's zone if it's one of ours, else Central. */
export function deviceZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (GAME_ZONES.some((z) => z.tz === tz)) return tz;
  } catch { /* fall through */ }
  return 'America/Chicago';
}

export const zoneLabel = (tz: string | null | undefined) => GAME_ZONES.find((z) => z.tz === tz)?.label ?? '';
export const zoneShort = (tz: string | null | undefined) => GAME_ZONES.find((z) => z.tz === tz)?.short ?? '';
export const zoneFromLabel = (label: string) => GAME_ZONES.find((z) => z.label === label)?.tz ?? null;

/** "6:30 PM CT" (zone only when set). */
export function timeWithZone(t: string | null | undefined, tz?: string | null): string {
  const l = toLabel(t);
  if (!l) return '';
  const z = zoneShort(tz);
  return z ? `${l} ${z}` : l;
}

// State → time zone (most of each state; split states use where most people live).
const STATE_ZONE: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  IN: 'America/New_York', KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York',
  VA: 'America/New_York', WV: 'America/New_York',
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', KS: 'America/Chicago',
  LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago', NE: 'America/Chicago',
  ND: 'America/Chicago', OK: 'America/Chicago', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  CO: 'America/Denver', ID: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};

/** Time zone from an address or "City, ST" ("… Dallas, TX 75202" → Central), or null. */
export function zoneFromPlace(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.toUpperCase().match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:\s*,\s*(?:USA|US|UNITED STATES))?\s*$/);
  return m ? STATE_ZONE[m[1]] ?? null : null;
}
