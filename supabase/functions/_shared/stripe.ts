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

// Platform take-rate in basis points (10000 = 100%). Default 10%.
export const PLATFORM_FEE_BPS = Number(Deno.env.get('PLATFORM_FEE_BPS') ?? '1000');

/** Estimate the processing fee (cents) used when a coach passes fees through. */
export function estimateProcessingFee(amountCents: number, method: 'card' | 'us_bank_account'): number {
  if (method === 'us_bank_account') {
    return Math.min(Math.round(amountCents * 0.008), 500); // ACH ~0.8%, capped $5
  }
  return Math.round(amountCents * 0.029) + 30; // card ~2.9% + 30¢
}

export interface FeeBreakdown {
  price_cents: number;
  service_fee_cents: number;   // surcharge line shown to the parent
  platform_fee_cents: number;  // application_fee_amount (RallyHUB take-rate)
  total_cents: number;         // what the parent pays
}

export function computeFees(
  priceCents: number,
  feeHandling: 'absorb' | 'surcharge',
  method: 'card' | 'us_bank_account',
): FeeBreakdown {
  const platform_fee_cents = Math.round((priceCents * PLATFORM_FEE_BPS) / 10000);
  const service_fee_cents = feeHandling === 'surcharge' ? estimateProcessingFee(priceCents, method) : 0;
  return {
    price_cents: priceCents,
    service_fee_cents,
    platform_fee_cents,
    total_cents: priceCents + service_fee_cents,
  };
}
