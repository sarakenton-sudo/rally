// refund-booking: parent or coach cancels a confirmed booking → cancel (RPC) and
// issue a refund per policy. See docs/coaching-payments-tech.md §3.5
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);

    const { booking_id, amount_cents } = await req.json();

    // Load booking + its request PI; verify caller is the parent or the coach.
    const { data: bk, error } = await supabaseAdmin
      .from('bookings')
      .select('id, parent_user_id, request_id, payment_status, coaches!inner(user_id), booking_requests!inner(payment_intent_id)')
      .eq('id', booking_id)
      .single();
    if (error || !bk) return json({ error: 'booking not found' }, 404);
    // deno-lint-ignore no-explicit-any
    const coachUserId = (bk as any).coaches.user_id;
    if (bk.parent_user_id !== userId && coachUserId !== userId) {
      return json({ error: 'not authorized' }, 403);
    }
    // deno-lint-ignore no-explicit-any
    const pi = (bk as any).booking_requests.payment_intent_id as string | null;

    // Transition booking + slot state.
    const { error: rpcErr } = await supabaseAdmin.rpc('cancel_booking', { p_booking_id: booking_id });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    let refundId: string | null = null;
    // Only refund money that was actually captured.
    if (pi && bk.payment_status === 'captured') {
      const refund = await stripe.refunds.create({
        payment_intent: pi,
        amount: amount_cents ?? undefined,           // omit = full refund
        reverse_transfer: true,                      // claw back the coach's share
        refund_application_fee: amount_cents ? false : true,
      });
      refundId = refund.id;
      await supabaseAdmin
        .from('bookings')
        .update({ payment_status: 'refunded' })
        .eq('id', booking_id);
      await supabaseAdmin.from('payment_events').insert({
        booking_id,
        type: 'refunded',
        amount_cents: refund.amount,
      });
    }

    console.log('[refund-booking] cancelled booking', booking_id, 'refund', refundId);
    return json({ refund_id: refundId, payment_status: refundId ? 'refunded' : bk.payment_status });
  } catch (err) {
    console.error('[refund-booking] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
