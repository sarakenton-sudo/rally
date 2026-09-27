// stripe-webhook: Stripe → RallyHUB reconciler. Signature-verified, idempotent
// (payment_events.stripe_event_id is UNIQUE). Deploy with --no-verify-jwt.
// Subscribe the endpoint to: payment_intent.succeeded, payment_intent.processing,
// payment_intent.payment_failed, charge.refunded, checkout.session.completed,
// account.updated (Connect: "events on connected accounts" too).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, cryptoProvider, supabaseAdmin, json, savePaymentMethod } from '../_shared/stripe.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

async function updateByPI(piId: string, patch: Record<string, unknown>) {
  const { data } = await supabaseAdmin.from('bookings').update(patch).eq('stripe_payment_intent_id', piId).select('id, request_id');
  return (data ?? [])[0] as { id: string; request_id: string } | undefined;
}

serve(async (req: Request) => {
  const sig = req.headers.get('Stripe-Signature');
  const body = await req.text(); // raw body required for signature verification

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', (err as Error).message);
    return json({ error: 'invalid signature' }, 400);
  }

  const { error: dupeErr } = await supabaseAdmin
    .from('payment_events')
    .insert({ type: `webhook:${event.type}`, stripe_event_id: event.id, raw: event as unknown as Record<string, unknown> });
  if (dupeErr?.code === '23505') return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as any;
        await updateByPI(pi.id, {
          payment_status: 'captured',
          stripe_charge_id: pi.latest_charge ?? null,
          paid_at: new Date().toISOString(),
          paid_amount_cents: pi.amount_received ?? pi.amount,
          last_charge_error: null,
        });
        break;
      }
      case 'payment_intent.processing': {
        await updateByPI((event.data.object as any).id, { payment_status: 'processing' });
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as any;
        // ACH can fail days later; retry tomorrow via charge-due-bookings.
        await updateByPI(pi.id, {
          payment_status: 'failed',
          stripe_charge_id: null,
          last_charge_error: pi.last_payment_error?.message ?? 'Payment failed',
          charge_due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        });
        break;
      }
      case 'charge.refunded': {
        const ch = event.data.object as any;
        if (ch.payment_intent) {
          await updateByPI(ch.payment_intent, {
            refunded_cents: ch.amount_refunded,
            payment_status: ch.amount_refunded >= ch.amount ? 'refunded' : 'captured',
          });
        }
        break;
      }
      case 'checkout.session.completed': {
        // Parent saved a payment method (setup mode). The app also confirms on
        // return; this covers them closing the tab first.
        const s = event.data.object as any;
        if (s.mode === 'setup' && s.metadata?.user_id && s.setup_intent) {
          const si = await stripe.setupIntents.retrieve(s.setup_intent);
          if (si.status === 'succeeded' && si.payment_method) {
            await savePaymentMethod(s.metadata.user_id, s.customer, si.payment_method as string);
          }
        }
        break;
      }
      case 'account.updated': {
        const acct = event.data.object as any;
        await supabaseAdmin.from('coaches').update({
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: !!acct.payouts_enabled,
          stripe_details_submitted: !!acct.details_submitted,
          identity_verified: !!acct.charges_enabled,
        }).eq('stripe_account_id', acct.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', event.type, err);
    return json({ error: 'handler error' }, 500); // Stripe retries
  }

  return json({ received: true });
});
