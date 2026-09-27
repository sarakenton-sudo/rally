// charge-due-bookings: charge confirmed lessons whose charge_due_at has arrived.
// Called every few minutes by pg_cron (header x-cron-secret = CRON_SECRET).
// Destination charge to the coach's Stripe account; RallyHUB keeps the
// application fee. Off-session with the parent's saved payment method.
// Card → captured now; ACH → 'processing' until the webhook reports success.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe, supabaseAdmin, json, computeCharge, getPlatformFeeBps, type PmType } from '../_shared/stripe.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const RETRY_HOURS = 24;
const MAX_ATTEMPTS = 3;

async function emailParent(userId: string, subject: string, html: string) {
  if (!SENDGRID_API_KEY) return;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const to = data?.user?.email;
  if (!to) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SENDGRID_API_KEY}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'hello@rally-hub.com', name: 'RallyHUB' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  }).catch((e) => console.error('[charge-due-bookings] email', e));
}

const retryLater = () => new Date(Date.now() + RETRY_HOURS * 3_600_000).toISOString();

serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);

  const feeBps = await getPlatformFeeBps();
  const { data: due, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, request_id, parent_user_id, price_cents, charge_attempts, stripe_charge_id,
      coaches(id, display_name, stripe_account_id, stripe_charges_enabled, fee_handling),
      athletes(first_name),
      slots(starts_at)
    `)
    .eq('status', 'confirmed')
    .in('payment_status', ['pending', 'failed'])
    .is('stripe_charge_id', null)
    .lte('charge_due_at', new Date().toISOString())
    .lt('charge_attempts', MAX_ATTEMPTS)
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, string> = {};
  for (const b of (due ?? []) as any[]) {
    const coach = b.coaches;
    // Coach hasn't finished Stripe setup: leave it pending (they may collect in person).
    if (!coach?.stripe_account_id || !coach.stripe_charges_enabled) { results[b.id] = 'coach_not_ready'; continue; }

    const { data: cust } = await supabaseAdmin
      .from('stripe_customers')
      .select('stripe_customer_id, payment_method_id, pm_type')
      .eq('user_id', b.parent_user_id)
      .maybeSingle();
    const attempt = (b.charge_attempts ?? 0) + 1;

    if (!cust?.payment_method_id) {
      await supabaseAdmin.from('bookings').update({
        charge_attempts: attempt, last_charge_error: 'No payment method on file', charge_due_at: retryLater(),
      }).eq('id', b.id);
      await emailParent(b.parent_user_id, `Add a payment method for ${b.athletes?.first_name ?? 'your athlete'}'s lesson`,
        `<p>${coach.display_name} confirmed a lesson, but there's no payment method on file.</p><p>Open <a href="https://rally-hub.com/app">RallyHUB</a> → My Coaches to add one.</p>`);
      results[b.id] = 'no_payment_method';
      continue;
    }

    const pm = (cust.pm_type === 'us_bank_account' ? 'us_bank_account' : 'card') as PmType;
    const fees = computeCharge(b.price_cents, coach.fee_handling === 'surcharge' ? 'surcharge' : 'absorb', pm, feeBps);
    const when = b.slots?.starts_at ? new Date(b.slots.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    try {
      const pi = await stripe.paymentIntents.create({
        amount: fees.total_cents,
        currency: 'usd',
        customer: cust.stripe_customer_id,
        payment_method: cust.payment_method_id,
        payment_method_types: [pm],
        off_session: true,
        confirm: true,
        application_fee_amount: fees.application_fee_cents,
        transfer_data: { destination: coach.stripe_account_id },
        on_behalf_of: coach.stripe_account_id,
        description: `Lesson with ${coach.display_name}${when ? ` · ${when}` : ''}`,
        statement_descriptor_suffix: 'LESSON',
        metadata: { booking_id: b.id, request_id: b.request_id, coach_id: coach.id },
      }, { idempotencyKey: `booking-${b.id}-attempt-${attempt}` });

      const succeeded = pi.status === 'succeeded';
      await supabaseAdmin.from('bookings').update({
        payment_status: succeeded ? 'captured' : 'processing',
        payment_method: pm === 'us_bank_account' ? 'ach' : 'card',
        stripe_payment_intent_id: pi.id,
        stripe_charge_id: (pi.latest_charge as string) ?? null,
        amount_charged_cents: fees.total_cents,
        service_fee_cents: fees.service_fee_cents,
        platform_fee_cents: fees.platform_fee_cents,
        paid_at: succeeded ? new Date().toISOString() : null,
        paid_amount_cents: succeeded ? fees.total_cents : null,
        charge_attempts: attempt,
        last_charge_error: null,
      }).eq('id', b.id);
      await supabaseAdmin.from('payment_events').insert({
        booking_id: b.id, request_id: b.request_id, type: succeeded ? 'charged' : 'charge_processing',
        amount_cents: fees.total_cents, raw: { payment_intent: pi.id, fees },
      });
      results[b.id] = pi.status;
    } catch (e: any) {
      // Card declined / needs authentication: retry tomorrow, tell the parent.
      const msg = e?.raw?.message ?? e?.message ?? 'Payment failed';
      await supabaseAdmin.from('bookings').update({
        payment_status: 'failed', charge_attempts: attempt, last_charge_error: msg,
        charge_due_at: retryLater(), stripe_payment_intent_id: e?.raw?.payment_intent?.id ?? null,
      }).eq('id', b.id);
      await supabaseAdmin.from('payment_events').insert({
        booking_id: b.id, request_id: b.request_id, type: 'charge_failed', amount_cents: fees.total_cents, raw: { message: msg, attempt },
      });
      await emailParent(b.parent_user_id, `Payment didn't go through for ${b.athletes?.first_name ?? 'your athlete'}'s lesson`,
        `<p>We couldn't charge your payment method for the lesson with ${coach.display_name}${when ? ` on ${when}` : ''}: ${msg}</p>` +
        `<p>Update it in <a href="https://rally-hub.com/app">RallyHUB</a> → My Coaches. We'll try again in ${RETRY_HOURS} hours.</p>`);
      results[b.id] = `failed: ${msg}`;
    }
  }

  return json({ processed: Object.keys(results).length, results });
});
