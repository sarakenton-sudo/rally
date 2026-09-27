// payment-method: a parent's saved way to pay (card, Apple Pay, Google Pay, ACH).
//   POST { action: 'setup', return_url }      → { url }  Stripe Checkout in setup mode
//   POST { action: 'confirm', session_id }    → { payment_method }  save after returning from Checkout
//   POST { action: 'get' }                    → { payment_method | null }
// JWT required. Charges happen later (charge-due-bookings), off-session.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions, ensureCustomer, savePaymentMethod } from '../_shared/stripe.ts';

async function summary(userId: string) {
  const { data } = await supabaseAdmin
    .from('stripe_customers')
    .select('payment_method_id, pm_type, pm_brand, pm_last4')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as any)?.payment_method_id ? data : null;
}

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'setup') {
      if (!body.return_url) return json({ error: 'return_url required' }, 400);
      const customer = await ensureCustomer(userId);
      const sep = body.return_url.includes('?') ? '&' : '?';
      const session = await stripe.checkout.sessions.create({
        mode: 'setup',
        customer,
        currency: 'usd',
        // Card covers Apple Pay / Google Pay in Checkout; us_bank_account = ACH.
        payment_method_types: ['card', 'us_bank_account'],
        payment_method_options: { us_bank_account: { verification_method: 'instant' } },
        success_url: `${body.return_url}${sep}pm_setup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${body.return_url}${sep}pm_setup=cancelled`,
        metadata: { user_id: userId, purpose: 'lesson_payment_method' },
      });
      return json({ url: session.url, session_id: session.id });
    }

    if (body.action === 'confirm') {
      if (!body.session_id) return json({ error: 'session_id required' }, 400);
      const session = await stripe.checkout.sessions.retrieve(body.session_id, { expand: ['setup_intent'] });
      if (session.metadata?.user_id !== userId) return json({ error: 'not your session' }, 403);
      const si = session.setup_intent as any;
      if (si?.status !== 'succeeded' || !si.payment_method) return json({ payment_method: await summary(userId) });
      await savePaymentMethod(userId, session.customer as string, si.payment_method as string);
      return json({ payment_method: await summary(userId) });
    }

    return json({ payment_method: await summary(userId) });
  } catch (err) {
    console.error('[payment-method]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
