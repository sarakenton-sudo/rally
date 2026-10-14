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
