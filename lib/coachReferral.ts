import { SITE_URL } from '@/lib/config';

// Coach-to-coach sharing: the text a coach sends another coach.
export const COACHES_PAGE_URL = `${SITE_URL}/coaches`;

export function coachReferralMessage(fromName?: string | null) {
  return `${fromName ? `It's ${fromName}. ` : ''}I've been using RallyHUB to run my lessons: open times families book themselves, reminders, signed releases and who's paid, all in one place. It's free for coaches: ${COACHES_PAGE_URL}`;
}
