// stripe-webhook: the reconciler. Signature-verified, idempotent. The only writer
// of terminal payment state. See docs/coaching-payments-tech.md §3.6 / §5
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, cryptoProvider, supabaseAdmin, json, corsHeaders } from '../_shared/stripe.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sig = req.headers.get('Stripe-Signature');
  const body = await req.text(); // raw body required for signature verification

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', (err as Error).message);
    return json({ error: 'invalid signature' }, 400);
  }

  // Idempotency: record the event id first. A duplicate delivery hits the UNIQUE
  // constraint and we short-circuit without reprocessing.
  const { error: dupeErr } = await supabaseAdmin
    .from('payment_events')
    .insert({ type: `webhook:${event.type}`, stripe_event_id: event.id, raw: event as unknown as Record<string, unknown> });
  if (dupeErr) {
    if (dupeErr.code === '23505') {
      console.log('[stripe-webhook] duplicate event', event.id, '— skipping');
      return json({ received: true, duplicate: true });
    }
    console.error('[stripe-webhook] failed to record event:', dupeErr.message);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as { id: string; latest_charge?: string };
        await updateBookingByPI(pi.id, { payment_status: 'captured', status: 'confirmed', stripe_charge_id: pi.latest_charge ?? null });
        break;
      }
      case 'payment_intent.payment_failed': {
        // Includes ACH returns that fail after a confirmed booking (§6 recovery).
        const pi = event.data.object as { id: string };
        await updateBookingByPI(pi.id, { payment_status: 'failed' });
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as { payment_intent: string };
        await updateBookingByPI(charge.payment_intent, { payment_status: 'refunded' });
        break;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object as { payment_intent: string };
        await updateBookingByPI(dispute.payment_intent, {}, 'dispute');
        console.warn('[stripe-webhook] DISPUTE opened for PI', dispute.payment_intent);
        break;
      }
      case 'account.updated': {
        const acct = event.data.object as { id: string; charges_enabled: boolean; payouts_enabled: boolean };
        await supabaseAdmin
          .from('coaches')
          .update({ identity_verified: acct.charges_enabled && acct.payouts_enabled })
          .eq('stripe_account_id', acct.id);
        break;
      }
      default:
        console.log('[stripe-webhook] unhandled event', event.type);
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error for', event.type, (err as Error).message);
    // Return 200 anyway: the event is recorded; Stripe retries help nothing here.
  }

  return json({ received: true });
});

/** Find the booking via its request's PaymentIntent and patch it. */
async function updateBookingByPI(
  paymentIntentId: string,
  patch: Record<string, unknown>,
  eventType?: string,
): Promise<void> {
  const { data: reqRow } = await supabaseAdmin
    .from('booking_requests')
    .select('id')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (!reqRow) return;

  const { data: bk } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('request_id', reqRow.id)
    .maybeSingle();
  if (!bk) return;

  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from('bookings').update(patch).eq('id', bk.id);
  }
  if (eventType) {
    await supabaseAdmin.from('payment_events').insert({ booking_id: bk.id, request_id: reqRow.id, type: eventType });
  }
}
