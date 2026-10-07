import { coachReferralMessage, COACHES_PAGE_URL } from '@/lib/coachReferral';

describe('coach-to-coach share', () => {
  it('links to the coaches landing page and names the sender', () => {
    expect(COACHES_PAGE_URL).toBe('https://rally-hub.com/coaches');
    const m = coachReferralMessage('Ben');
    expect(m.startsWith("It's Ben.")).toBe(true);
    expect(m.endsWith('https://rally-hub.com/coaches')).toBe(true);
    expect(m).not.toMatch(/payment|charge/i);
  });
});
