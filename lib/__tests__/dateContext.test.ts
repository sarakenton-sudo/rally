import { dateContext } from '../../supabase/functions/_shared/dates';

describe('AI date context (P-06)', () => {
  it('injects today and no fixed season year', () => {
    const s = dateContext(new Date('2026-10-04T12:00:00Z'));
    expect(s).toContain('today is 2026-10-04');
    expect(s).not.toMatch(/20\d\d-20\d\d/);
  });
});
