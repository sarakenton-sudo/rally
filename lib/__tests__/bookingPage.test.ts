import { bookingPageUrl, embedSnippet, qrImageUrl } from '@/lib/bookingPage';
import { PLANS_INBOX_EMAIL, COACH_INVITE_URL } from '@/lib/config';

describe('booking page links (C-08, B-04)', () => {
  it('builds the public URL', () => {
    expect(bookingPageUrl('coach-sam')).toBe('https://rally-hub.com/book/coach-sam');
  });
  it('embeds with theme and accent, without the #', () => {
    const s = embedSnippet('coach-sam', { theme: 'dark', accent: '#3B82B0' });
    expect(s).toContain('src="https://rally-hub.com/book/coach-sam?embed=1&theme=dark&accent=3B82B0"');
    expect(s.startsWith('<iframe')).toBe(true);
  });
  it('encodes the URL in the QR request', () => {
    expect(qrImageUrl('https://rally-hub.com/book/a b')).toContain(encodeURIComponent('https://rally-hub.com/book/a b'));
  });
});

describe('config', () => {
  it('forwards to the rally-hub.com inbox', () => expect(PLANS_INBOX_EMAIL).toBe('plans@rally-hub.com'));
  it('coach invite opens sign-up as a coach', () => expect(COACH_INVITE_URL).toBe('https://rally-hub.com/auth?signup=true&role=coach'));
});
