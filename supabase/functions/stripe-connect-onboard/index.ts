// stripe-connect-onboard: create/resume a coach's Stripe Connect Express account
// and return a hosted onboarding link. See docs/coaching-payments-tech.md §3.1
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://rally-hub.com';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);

    const { coach_id, refresh_url, return_url } = await req.json();

    // Verify the caller owns this coach listing.
    const { data: coach, error } = await supabaseAdmin
      .from('coaches')
      .select('id, user_id, stripe_account_id, display_name')
      .eq('id', coach_id)
      .single();
    if (error || !coach) return json({ error: 'coach not found' }, 404);
    if (coach.user_id !== userId) return json({ error: 'not your listing' }, 403);

    let accountId = coach.stripe_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        business_profile: { name: coach.display_name },
        metadata: { coach_id: coach.id },
      });
      accountId = account.id;
      await supabaseAdmin.from('coaches').update({ stripe_account_id: accountId }).eq('id', coach.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refresh_url ?? `${APP_URL}/coach`,
      return_url: return_url ?? `${APP_URL}/coach`,
      type: 'account_onboarding',
    });

    console.log('[stripe-connect-onboard] link created for coach', coach.id);
    return json({ url: link.url });
  } catch (err) {
    console.error('[stripe-connect-onboard] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
