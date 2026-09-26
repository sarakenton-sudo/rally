// create-booking-intent: after request_booking() reserved the slot, create a
// manual-capture PaymentIntent (destination charge to the coach, platform fee to
// RallyHUB). Returns the client secret. See docs/coaching-payments-tech.md §3.2
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions, computeFees } from '../_shared/stripe.ts';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);

    const { request_id, payment_method_type } = await req.json();
    const method: 'card' | 'us_bank_account' =
      payment_method_type === 'us_bank_account' ? 'us_bank_account' : 'card';

    // Load the request and verify the caller is the parent who made it.
    const { data: reqRow, error } = await supabaseAdmin
      .from('booking_requests')
      .select('id, parent_user_id, coach_id, athlete_id, session_type_id, status, payment_intent_id')
      .eq('id', request_id)
      .single();
    if (error || !reqRow) return json({ error: 'request not found' }, 404);
    if (reqRow.parent_user_id !== userId) return json({ error: 'not your request' }, 403);
    if (reqRow.status !== 'requested') return json({ error: `request is ${reqRow.status}` }, 409);

    const { data: sType } = await supabaseAdmin
      .from('session_types')
      .select('price_cents, booking_mode')
      .eq('id', reqRow.session_type_id)
      .single();
    const { data: coach } = await supabaseAdmin
      .from('coaches')
      .select('stripe_account_id, fee_handling')
      .eq('id', reqRow.coach_id)
      .single();

    if (!sType || !coach) return json({ error: 'session type or coach missing' }, 404);
    if (!coach.stripe_account_id) return json({ error: 'coach has not completed payout setup' }, 409);

    const fees = computeFees(sType.price_cents, coach.fee_handling, method);
    const instant = sType.booking_mode === 'instant';

    const intent = await stripe.paymentIntents.create(
      {
        amount: fees.total_cents,
        currency: 'usd',
        capture_method: instant ? 'automatic' : 'manual',
        payment_method_types: [method],
        application_fee_amount: fees.platform_fee_cents,
        transfer_data: { destination: coach.stripe_account_id },
        metadata: {
          request_id: reqRow.id,
          coach_id: reqRow.coach_id,
          parent_user_id: reqRow.parent_user_id,
          athlete_id: reqRow.athlete_id,
        },
      },
      { idempotencyKey: `req_${reqRow.id}` }, // double-tap safe
    );

    await supabaseAdmin
      .from('booking_requests')
      .update({ payment_intent_id: intent.id })
      .eq('id', reqRow.id);

    console.log('[create-booking-intent] PI', intent.id, 'for request', reqRow.id);
    return json({
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      amount_breakdown: fees,
      instant,
    });
  } catch (err) {
    console.error('[create-booking-intent] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
