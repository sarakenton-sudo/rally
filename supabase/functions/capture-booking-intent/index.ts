// capture-booking-intent: coach accepts a request → create the booking (RPC) and
// capture the PaymentIntent. See docs/coaching-payments-tech.md §3.3
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);

    const { request_id } = await req.json();

    // Verify the caller owns the coach on this request (the RPC bypasses the coach
    // check when called via service role, so we enforce ownership here).
    const { data: reqRow, error } = await supabaseAdmin
      .from('booking_requests')
      .select('id, coach_id, payment_intent_id, status, coaches!inner(user_id)')
      .eq('id', request_id)
      .single();
    if (error || !reqRow) return json({ error: 'request not found' }, 404);
    // deno-lint-ignore no-explicit-any
    if ((reqRow as any).coaches.user_id !== userId) return json({ error: 'not your request' }, 403);
    if (reqRow.status !== 'requested') return json({ error: `request is ${reqRow.status}` }, 409);
    if (!reqRow.payment_intent_id) return json({ error: 'no payment intent on request' }, 409);

    // Transition state: accept → booking row created, slot booked.
    const { data: accepted, error: rpcErr } = await supabaseAdmin.rpc('accept_booking_request', {
      p_request_id: request_id,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);
    const bookingId = (accepted as { booking_id: string }).booking_id;

    // Capture the authorized funds.
    const pi = await stripe.paymentIntents.capture(reqRow.payment_intent_id);
    const charge = pi.latest_charge as string | null;
    const method = pi.payment_method_types?.[0] === 'us_bank_account' ? 'ach' : 'card';

    await supabaseAdmin
      .from('bookings')
      .update({ payment_status: 'captured', stripe_charge_id: charge, payment_method: method })
      .eq('id', bookingId);

    await supabaseAdmin.from('payment_events').insert({
      booking_id: bookingId,
      request_id,
      type: 'captured',
      amount_cents: pi.amount,
    });

    console.log('[capture-booking-intent] captured', reqRow.payment_intent_id, 'booking', bookingId);
    return json({ booking_id: bookingId, payment_status: 'captured' });
  } catch (err) {
    console.error('[capture-booking-intent] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
