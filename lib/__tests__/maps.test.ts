import { mapsLinks } from '@/lib/maps';

describe('mapsLinks (lesson directions)', () => {
  const l = mapsLinks(' 1200 Barton Springs Rd, Austin, TX ');
  it('Apple Maps directions', () => expect(l.apple).toBe('maps://?daddr=1200%20Barton%20Springs%20Rd%2C%20Austin%2C%20TX'));
  it('Google Maps app', () => expect(l.googleApp).toBe('comgooglemaps://?daddr=1200%20Barton%20Springs%20Rd%2C%20Austin%2C%20TX&directionsmode=driving'));
  it('Google Maps web fallback', () => expect(l.googleWeb).toBe('https://www.google.com/maps/dir/?api=1&destination=1200%20Barton%20Springs%20Rd%2C%20Austin%2C%20TX'));
});
