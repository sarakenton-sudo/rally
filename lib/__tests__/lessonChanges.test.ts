import { canFamilyChangeLesson, LESSON_CHANGE_CUTOFF_HOURS } from '@/lib/coach';

describe('family lesson changes cutoff (00082)', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
  it('is 24 hours, matching the automatic-refund rule', () => expect(LESSON_CHANGE_CUTOFF_HOURS).toBe(24));
  it('allows cancel/reschedule 24h or more ahead', () => {
    expect(canFamilyChangeLesson(inHours(24), now)).toBe(true);
    expect(canFamilyChangeLesson(inHours(72), now)).toBe(true);
  });
  it('sends the family to the coach inside 24h', () => {
    expect(canFamilyChangeLesson(inHours(23.9), now)).toBe(false);
    expect(canFamilyChangeLesson(inHours(-1), now)).toBe(false);
  });
});
