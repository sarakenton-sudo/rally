// stripe-connect: everything a coach does with their Stripe Express account.
//   POST { action: 'onboard', return_url }  → { url }   hosted identity/bank setup (create or resume)
//   POST { action: 'status' }               → { charges_enabled, payouts_enabled, details_submitted }
//   POST { action: 'dashboard' }            → { url }   Stripe Express dashboard login link
//   POST { action: 'payouts' }              → { available_cents, pending_cents, payouts: [...] }
// JWT required; the caller must own a coach listing.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://rally-hub.com';

async function syncStatus(coachId: string, accountId: string) {
  const acct = await stripe.accounts.retrieve(accountId);
  const status = {
    stripe_charges_enabled: !!acct.charges_enabled,
    stripe_payouts_enabled: !!acct.payouts_enabled,
    stripe_details_submitted: !!acct.details_submitted,
    identity_verified: !!acct.charges_enabled,
  };
  await supabaseAdmin.from('coaches').update(status).eq('id', coachId);
  return {
    charges_enabled: status.stripe_charges_enabled,
    payouts_enabled: status.stripe_payouts_enabled,
    details_submitted: status.stripe_details_submitted,
    requirements_due: acct.requirements?.currently_due ?? [],
  };
}

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);

    const { data: coach } = await supabaseAdmin
      .from('coaches')
      .select('id, user_id, display_name, stripe_account_id, phone')
      .eq('user_id', userId)
      .maybeSingle();
    if (!coach) return json({ error: 'not a coach' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'onboard';
    let accountId = coach.stripe_account_id as string | null;

    if (action === 'onboard') {
      if (!accountId) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: u?.user?.email ?? undefined,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
            us_bank_account_ach_payments: { requested: true },
          },
          business_type: 'individual',
          business_profile: {
            name: coach.display_name,
            product_description: 'Private volleyball lessons booked through RallyHUB',
            mcc: '7997', // clubs / sports instruction
          },
          metadata: { coach_id: coach.id },
        });
        accountId = account.id;
        await supabaseAdmin.from('coaches').update({ stripe_account_id: accountId }).eq('id', coach.id);
      }
      const back = body.return_url ?? `${APP_URL}/coach/payments`;
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: back,
        return_url: back,
        type: 'account_onboarding',
      });
      return json({ url: link.url });
    }

    if (!accountId) return json({ charges_enabled: false, payouts_enabled: false, details_submitted: false, connected: false });

    if (action === 'status') {
      return json({ connected: true, ...(await syncStatus(coach.id, accountId)) });
    }

    if (action === 'dashboard') {
      const link = await stripe.accounts.createLoginLink(accountId);
      return json({ url: link.url });
    }

    if (action === 'payouts') {
      const [balance, payouts] = await Promise.all([
        stripe.balance.retrieve({ stripeAccount: accountId }),
        stripe.payouts.list({ limit: 20 }, { stripeAccount: accountId }),
      ]);
      const sum = (arr: { amount: number; currency: string }[]) =>
        arr.filter((b) => b.currency === 'usd').reduce((n, b) => n + b.amount, 0);
      return json({
        available_cents: sum(balance.available),
        pending_cents: sum(balance.pending),
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amount_cents: p.amount,
          status: p.status,               // pending | in_transit | paid | failed | canceled
          arrival_date: new Date(p.arrival_date * 1000).toISOString(),
          bank_last4: (p.destination as any)?.last4 ?? null,
        })),
      });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (err) {
    console.error('[stripe-connect]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
