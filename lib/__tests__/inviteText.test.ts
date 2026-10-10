import { familyInviteMessage } from '@/lib/inviteText';

describe('family invite text', () => {
  it('leads with the app, puts the code on its own line, and links sign-up with the code', () => {
    const m = familyInviteMessage('coparent', 'Drue & Miles', 'a1b2c3d4e5f6');
    expect(m.indexOf('Get the app')).toBeLessThan(m.indexOf('a1b2c3d4e5f6'));
    expect(m).toContain('\n\na1b2c3d4e5f6\n\n');
    expect(m).toContain('/auth?signup=true&invite=a1b2c3d4e5f6');
    expect(m).toContain('co-parent for Drue & Miles');
  });
});
