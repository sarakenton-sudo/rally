/**
 * App-wide constants. Use these instead of hard-coded strings.
 * PLANS_INBOX_EMAIL: where families forward confirmations (SendGrid inbound
 * parse → process-email). Must match the MX setup for rally-hub.com.
 */
export const PLANS_INBOX_EMAIL = 'plans@rally-hub.com';
export const SITE_URL = 'https://rally-hub.com';
/** Coach sign-up link used in "Invite your coach" messages. */
export const COACH_INVITE_URL = `${SITE_URL}/coaches`;
