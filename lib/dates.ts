/**
 * Format a date string (YYYY-MM-DD) to a readable format.
 * e.g. "Mar 20-22, 2026"
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (startDate === endDate) {
    return `${startMonth} ${startDay}, ${year}`;
  }

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  }

  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Returns the number of days until a date. Negative if in the past.
 */
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Human-readable countdown string.
 */
export function countdownText(startDate: string, endDate: string): string {
  const daysToStart = daysUntil(startDate);
  const daysToEnd = daysUntil(endDate);

  if (daysToEnd < 0) return 'Completed';
  if (daysToStart <= 0 && daysToEnd >= 0) return 'Happening now';
  if (daysToStart === 1) return 'Tomorrow';
  if (daysToStart <= 7) return `${daysToStart} days away`;
  if (daysToStart <= 30) {
    const weeks = Math.floor(daysToStart / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} away`;
  }
  return `${daysToStart} days away`;
}
