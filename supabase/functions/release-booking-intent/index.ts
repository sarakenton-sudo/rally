// release-booking-intent: coach declines (or system expires) a request → release
// the slot (RPC) and cancel the PaymentIntent authorization.
// See docs/coaching-payments-tech.md §3.4
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { request_id, reason } = await req.json();
    const isExpiry = reason === 'expired';

    // Decline requires the owning coach; expiry is service-role only.
    if (!isExpiry) {
      const userId = await getUserId(req);
      if (!userId) return json({ error: 'auth required' }, 401);
      const { data: reqRow, error } = await supabaseAdmin
        .from('booking_requests')
        .select('id, status, coaches!inner(user_id)')
        .eq('id', request_id)
        .single();
      if (error || !reqRow) return json({ error: 'request not found' }, 404);
      // deno-lint-ignore no-explicit-any
      if ((reqRow as any).coaches.user_id !== userId) return json({ error: 'not your request' }, 403);
    }

    const { data: released, error: rpcErr } = await supabaseAdmin.rpc('decline_booking_request', {
      p_request_id: request_id,
      p_reason: isExpiry ? 'expired' : 'declined',
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    const pi = (released as { payment_intent_id: string | null }).payment_intent_id;
    if (pi) {
      try {
        await stripe.paymentIntents.cancel(pi);
      } catch (e) {
        // Already canceled/captured — log and continue; state is authoritative in DB.
        console.warn('[release-booking-intent] PI cancel warning:', (e as Error).message);
      }
      await supabaseAdmin.from('payment_events').insert({
        request_id,
        type: isExpiry ? 'expired' : 'declined',
      });
    }

    console.log('[release-booking-intent] released request', request_id, 'reason', reason);
    return json({ released: true });
  } catch (err) {
    console.error('[release-booking-intent] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
