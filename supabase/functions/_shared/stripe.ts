// Shared Stripe + Supabase helpers for the coaching payments edge functions.
// See docs/coaching-payments-tech.md
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

// Async crypto provider — required for webhook signature verification in Deno.
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Service-role client: bypasses RLS. Edge functions are the trusted writer of
// terminal payment state and the orchestrator of the booking RPCs.
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

/** Resolve the calling user's id from the request JWT (null if unauthenticated). */
export async function getUserId(req: Request): Promise<string | null> {
  const authz = req.headers.get('Authorization');
  if (!authz) return null;
  const token = authz.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Take rate in basis points (1000 = 10%) — admin setting in platform_settings. */
export async function getPlatformFeeBps(): Promise<number> {
  const { data } = await supabaseAdmin.from('platform_settings').select('platform_fee_bps').maybeSingle();
  return (data as any)?.platform_fee_bps ?? 1000;
}

export type PmType = 'card' | 'us_bank_account';

/** Stripe's processing fee estimate (cents). Card ~2.9% + 30¢; ACH 0.8% capped at $5. */
export function estimateStripeFee(amountCents: number, pm: PmType): number {
  return pm === 'us_bank_account'
    ? Math.min(Math.round(amountCents * 0.008), 500)
    : Math.round(amountCents * 0.029) + 30;
}

export interface ChargeBreakdown {
  price_cents: number;          // the coach's listed price
  service_fee_cents: number;    // added for the parent when the coach passes fees through
  total_cents: number;          // what the parent is charged
  platform_fee_cents: number;   // RallyHUB take rate
  application_fee_cents: number;// kept by the platform (take rate + Stripe fee, which the platform pays on destination charges)
  coach_net_cents: number;      // what lands in the coach's Stripe balance
}

/**
 * Destination charges: the platform account pays Stripe's fee, so the
 * application fee must cover it. 'absorb' → coach bears the fee;
 * 'surcharge' → parent pays it as a service fee (grossed up so the fee on the
 * total is covered).
 */
export function computeCharge(priceCents: number, feeHandling: 'absorb' | 'surcharge', pm: PmType, feeBps: number): ChargeBreakdown {
  const platform = Math.round((priceCents * feeBps) / 10000);
  if (feeHandling === 'surcharge') {
    const total = pm === 'us_bank_account'
      ? priceCents + Math.min(Math.ceil(priceCents * 0.008 / (1 - 0.008)), 500)
      : Math.ceil((priceCents + 30) / (1 - 0.029));
    const service = total - priceCents;
    return {
      price_cents: priceCents, service_fee_cents: service, total_cents: total,
      platform_fee_cents: platform,
      application_fee_cents: platform + service,
      coach_net_cents: priceCents - platform,
    };
  }
  const stripeFee = estimateStripeFee(priceCents, pm);
  return {
    price_cents: priceCents, service_fee_cents: 0, total_cents: priceCents,
    platform_fee_cents: platform,
    application_fee_cents: Math.min(platform + stripeFee, priceCents),
    coach_net_cents: Math.max(priceCents - platform - stripeFee, 0),
  };
}

/** Ensure the parent has a Stripe Customer; returns its id. */
export async function ensureCustomer(userId: string): Promise<string> {
  const { data: row } = await supabaseAdmin.from('stripe_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle();
  if ((row as any)?.stripe_customer_id) return (row as any).stripe_customer_id;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const customer = await stripe.customers.create({ email: u?.user?.email ?? undefined, metadata: { user_id: userId } });
  await supabaseAdmin.from('stripe_customers').upsert({ user_id: userId, stripe_customer_id: customer.id });
  return customer.id;
}

/** Save a payment method as the parent's default (summary shown in the app). */
export async function savePaymentMethod(userId: string, customerId: string, paymentMethodId: string) {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  const isBank = pm.type === 'us_bank_account';
  await supabaseAdmin.from('stripe_customers').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    payment_method_id: paymentMethodId,
    pm_type: pm.type,
    pm_brand: isBank ? (pm.us_bank_account?.bank_name ?? 'Bank') : (pm.card?.wallet?.type ?? pm.card?.brand ?? 'card'),
    pm_last4: isBank ? pm.us_bank_account?.last4 : pm.card?.last4,
    updated_at: new Date().toISOString(),
  });
}
