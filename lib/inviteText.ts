import { APP_STORE_URL } from '@/lib/fan';
import { SITE_URL } from '@/lib/config';

/**
 * Text for a co-parent or athlete invite: get the app first, then the code on
 * its own line (easy to copy), then a web link with the code filled in.
 */
export function familyInviteMessage(kind: 'coparent' | 'athlete', who: string, code: string): string {
  const intro = kind === 'athlete'
    ? `You have your own RallyHUB login to see your schedule, team code and streams.`
    : `I added you to RallyHUB as a co-parent for ${who}: the schedule, travel and team info in one place.`;
  return `${intro}\n\n` +
    `1. Get the app: ${APP_STORE_URL}\n` +
    `2. Tap Create account, then "Have an invite code?" and enter:\n\n` +
    `${code}\n\n` +
    `On a computer: ${SITE_URL}/auth?signup=true&invite=${code}`;
}
