/**
 * App-wide constants. Use these instead of hard-coded strings.
 * PLANS_INBOX_EMAIL: where families forward confirmations (SendGrid inbound
 * parse → process-email). Must match the MX setup for rally-hub.com.
 */
export const PLANS_INBOX_EMAIL = 'plans@rally-hub.com';
export const SITE_URL = 'https://rally-hub.com';
/** Coach sign-up link used in "Invite your coach" messages. */
/**
 * In-app card payments (Stripe). Off until Stripe is set up: coaches record
 * cash/Venmo/Zelle instead, and nothing asks families for a card. Flip to
 * true once the Stripe keys and webhooks are live.
 */
export const PAYMENTS_ENABLED = false;

export const COACH_INVITE_URL = `${SITE_URL}/coaches`;
