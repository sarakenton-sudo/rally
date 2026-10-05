// refund-booking: refund a cancelled lesson's card/ACH payment per policy.
// Called by the app right after a cancel succeeds.
//   POST { booking_id }  (JWT: the booking's coach or parent)
// Policy (matches the default Lesson Terms):
//   * Coach cancelled → full refund.
//   * Parent cancelled 24h+ before the lesson → full refund.
//   * Parent cancelled inside 24h → no automatic refund (coach can refund in Stripe).
// The platform fee is refunded proportionally (refund_application_fee) and the
// transfer reversed, so the coach isn't out of pocket for a coach-side refund.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, getUserId, json, handleOptions } from '../_shared/stripe.ts';

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const userId = await getUserId(req);
    if (!userId) return json({ error: 'auth required' }, 401);
    const { booking_id } = await req.json();

    const { data: b } = await supabaseAdmin
      .from('bookings')
      .select('id, request_id, parent_user_id, athlete_id, status, payment_status, stripe_payment_intent_id, refunded_cents, amount_charged_cents, updated_at, coaches(user_id), slots(starts_at)')
      .eq('id', booking_id)
      .maybeSingle();
    const bk = b as any;
    if (!bk) return json({ error: 'booking not found' }, 404);
    const byCoach = bk.coaches?.user_id === userId;
    // The family: the parent who booked, or a co-parent who manages the athlete.
    let byFamily = bk.parent_user_id === userId;
    if (!byCoach && !byFamily) {
      const { data: mgr } = await supabaseAdmin.from('admin_athletes').select('admin_id')
        .eq('athlete_id', bk.athlete_id).eq('admin_id', userId).eq('permission', 'manage').maybeSingle();
      byFamily = !!mgr;
    }
    if (!byCoach && !byFamily) return json({ error: 'not authorized' }, 403);
    if (bk.status !== 'cancelled') return json({ error: 'booking is not cancelled' }, 400);
    if (!bk.stripe_payment_intent_id || !['captured', 'processing'].includes(bk.payment_status)) {
      return json({ refunded: false, reason: 'nothing charged in RallyHUB' });
    }
    if (bk.refunded_cents > 0) return json({ refunded: false, reason: 'already refunded' });

    const hoursBefore = (new Date(bk.slots?.starts_at).getTime() - Date.now()) / 3_600_000;
    if (!byCoach && hoursBefore < 24) {
      return json({ refunded: false, reason: 'cancelled inside 24 hours — no automatic refund per the lesson terms' });
    }

    const refund = await stripe.refunds.create({
      payment_intent: bk.stripe_payment_intent_id,
      refund_application_fee: true,
      reverse_transfer: true,
      metadata: { booking_id: bk.id, cancelled_by: byCoach ? 'coach' : 'parent' },
    }, { idempotencyKey: `refund-${bk.id}` });

    await supabaseAdmin.from('bookings').update({
      payment_status: 'refunded',
      refunded_cents: refund.amount,
    }).eq('id', bk.id);
    await supabaseAdmin.from('payment_events').insert({
      booking_id: bk.id, request_id: bk.request_id, type: 'refunded', amount_cents: refund.amount, raw: { refund: refund.id },
    });

    return json({ refunded: true, amount_cents: refund.amount });
  } catch (err) {
    console.error('[refund-booking]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
