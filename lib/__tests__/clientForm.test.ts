import { validateNewClient, positionsFrom, releaseLabel, isEmail } from '@/lib/clientForm';

const now = new Date(2026, 9, 5);
describe('Add client form', () => {
  it('needs only athlete first name and parent email', () => {
    expect(validateNewClient({ parentEmail: 'jo@x.com', athleteFirst: 'Maya' }, now)).toBeNull();
    expect(validateNewClient({ parentEmail: '', athleteFirst: 'Maya' }, now)).toMatch(/email/);
    expect(validateNewClient({ parentEmail: 'jo@x.com', athleteFirst: ' ' }, now)).toMatch(/first name/);
    expect(validateNewClient({ parentEmail: 'jo@x', athleteFirst: 'Maya' }, now)).toMatch(/look right/);
  });
  it('checks grad year only when given', () => {
    expect(validateNewClient({ parentEmail: 'jo@x.com', athleteFirst: 'Maya', gradYear: '2030' }, now)).toBeNull();
    expect(validateNewClient({ parentEmail: 'jo@x.com', athleteFirst: 'Maya', gradYear: '30' }, now)).toMatch(/Grad year/);
  });
  it('emails', () => { expect(isEmail(' a+b@c.co ')).toBe(true); expect(isEmail('a@b')).toBe(false); });
});

describe('positions', () => {
  it('keeps primary then secondary, without blanks or duplicates', () => {
    expect(positionsFrom('S', 'OPP')).toEqual(['S', 'OPP']);
    expect(positionsFrom('S', 'S')).toEqual(['S']);
    expect(positionsFrom('', 'MB')).toEqual(['MB']);
    expect(positionsFrom()).toEqual([]);
  });
});

describe('release status', () => {
  it('labels signed, outdated and missing', () => {
    expect(releaseLabel(null)).toEqual({ text: 'Not signed', ok: false });
    expect(releaseLabel({ signer_name: 'Jordan Carter', accepted_at: '2026-10-04T15:00:00Z' }).ok).toBe(true);
    expect(releaseLabel({ signer_name: 'Jordan Carter', accepted_at: '2026-10-04T15:00:00Z', outdated: true }).text).toMatch(/re-sign/);
  });
});
