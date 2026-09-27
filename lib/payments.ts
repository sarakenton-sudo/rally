import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/types/database';

// Stripe pages must return to an https URL. On web we come straight back to the
// app page; in the iPhone app Stripe lands on /payment-return and we refresh
// when the in-app browser closes.
const SITE = 'https://rally-hub.com';

export type PaymentTiming = 'on_accept' | 'hours_before' | 'after_lesson';
export type FeeHandling = 'absorb' | 'surcharge';

export interface SavedPaymentMethod {
  payment_method_id: string;
  pm_type: 'card' | 'us_bank_account' | string;
  pm_brand: string | null;
  pm_last4: string | null;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) return { data: null, error };
  if ((data as any)?.error) return { data: null, error: new Error((data as any).error) };
  return { data: data as T, error: null };
}

/** Open a Stripe-hosted page. Resolves when the user is back (native) or immediately (web redirect). */
async function openStripe(url: string) {
  if (Platform.OS === 'web') { window.location.href = url; return; }
  await WebBrowser.openBrowserAsync(url);
}

export function describePaymentMethod(pm: SavedPaymentMethod | null): string {
  if (!pm) return 'No payment method';
  const brand = (pm.pm_brand ?? '').replace(/_/g, ' ');
  const nice = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : pm.pm_type === 'us_bank_account' ? 'Bank' : 'Card';
  return `${nice}${pm.pm_last4 ? ` ••${pm.pm_last4}` : ''}`;
}

// ---- Parents ----

export async function getPaymentMethod() {
  return invoke<{ payment_method: SavedPaymentMethod | null }>('payment-method', { action: 'get' });
}

/**
 * Add/replace the parent's payment method via Stripe Checkout (setup mode).
 * Web: redirects away and comes back to `webReturnPath` with ?pm_setup=success&session_id=…
 * Native: opens the in-app browser and confirms when it closes.
 */
export async function addPaymentMethod(webReturnPath: string): Promise<{ data: SavedPaymentMethod | null; error: Error | null }> {
  const returnUrl = Platform.OS === 'web' ? `${window.location.origin}${webReturnPath}` : `${SITE}/payment-return`;
  const { data, error } = await invoke<{ url: string; session_id: string }>('payment-method', { action: 'setup', return_url: returnUrl });
  if (error || !data?.url) return { data: null, error: error ?? new Error('Could not start checkout') };
  await openStripe(data.url);
  if (Platform.OS === 'web') return { data: null, error: null }; // page is navigating away
  return confirmPaymentMethod(data.session_id);
}

export async function confirmPaymentMethod(sessionId: string): Promise<{ data: SavedPaymentMethod | null; error: Error | null }> {
  const { data, error } = await invoke<{ payment_method: SavedPaymentMethod | null }>('payment-method', { action: 'confirm', session_id: sessionId });
  return { data: data?.payment_method ?? null, error };
}

export async function removePaymentMethod() {
  return invoke<{ payment_method: null }>('payment-method', { action: 'remove' });
}

export async function openReceipt(bookingId: string): Promise<{ error: Error | null }> {
  const { data, error } = await invoke<{ url: string }>('payment-method', { action: 'receipt', booking_id: bookingId });
  if (error || !data?.url) return { error: error ?? new Error('Receipt unavailable') };
  if (Platform.OS === 'web') window.open(data.url, '_blank'); else await WebBrowser.openBrowserAsync(data.url);
  return { error: null };
}

export interface ParentCharge {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  price_cents: number;
  amount_charged_cents: number | null;
  refunded_cents: number;
  paid_at: string | null;
  charge_due_at: string | null;
  last_charge_error: string | null;
  coaches: { display_name: string } | null;
  athletes: { first_name: string } | null;
  slots: { starts_at: string } | null;
}

/** The parent's lessons with payment state, newest lesson first. */
export async function fetchMyCharges(): Promise<ParentCharge[]> {
  const { data } = await (supabase.from('bookings') as any)
    .select('id, status, payment_status, payment_method, price_cents, amount_charged_cents, refunded_cents, paid_at, charge_due_at, last_charge_error, coaches(display_name), athletes(first_name), slots(starts_at)')
    .order('created_at', { ascending: false })
    .limit(100);
  return ((data as ParentCharge[]) ?? []).sort((a, b) => (b.slots?.starts_at ?? '').localeCompare(a.slots?.starts_at ?? ''));
}

// ---- Coaches ----

export interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due?: string[];
}

export async function getConnectStatus() {
  return invoke<ConnectStatus>('stripe-connect', { action: 'status' });
}

/** Start or resume Stripe Express onboarding; returns once the browser closes (native). */
export async function startConnectOnboarding(): Promise<{ error: Error | null }> {
  const returnUrl = Platform.OS === 'web' ? `${window.location.origin}/coach/payments` : `${SITE}/payment-return?for=coach`;
  const { data, error } = await invoke<{ url: string }>('stripe-connect', { action: 'onboard', return_url: returnUrl });
  if (error || !data?.url) return { error: error ?? new Error('Could not start Stripe setup') };
  await openStripe(data.url);
  return { error: null };
}

export async function openStripeDashboard(): Promise<{ error: Error | null }> {
  const { data, error } = await invoke<{ url: string }>('stripe-connect', { action: 'dashboard' });
  if (error || !data?.url) return { error: error ?? new Error('Could not open Stripe') };
  if (Platform.OS === 'web') window.open(data.url, '_blank'); else Linking.openURL(data.url);
  return { error: null };
}

export interface PayoutsInfo {
  available_cents: number;
  pending_cents: number;
  payouts: { id: string; amount_cents: number; status: string; arrival_date: string; bank_last4: string | null }[];
}

export async function getPayouts() {
  return invoke<PayoutsInfo>('stripe-connect', { action: 'payouts' });
}

export async function savePaymentSettings(timing: PaymentTiming, hoursBefore: number, feeHandling: FeeHandling): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('set_my_payment_settings', {
    p_timing: timing, p_hours_before: hoursBefore, p_fee_handling: feeHandling,
  });
  return { error: error ?? null };
}

export async function getPlatformFeeBps(): Promise<number> {
  const { data } = await (supabase.rpc as any)('get_platform_fee_bps');
  return typeof data === 'number' ? data : 1000;
}

/** Refund per policy after a cancel (no-op if nothing was charged in RallyHUB). */
export async function refundBooking(bookingId: string) {
  return invoke<{ refunded: boolean; amount_cents?: number; reason?: string }>('refund-booking', { booking_id: bookingId });
}

// ---- Earnings ----

export interface EarningsRow extends Booking {
  amount_charged_cents?: number | null;
  refunded_cents?: number;
  paid_at?: string | null;
  paid_amount_cents?: number | null;
  last_charge_error?: string | null;
  charge_due_at?: string | null;
  slots?: { starts_at: string } | null;
  athletes?: { first_name: string; last_name: string | null } | null;
}

/** Bookings whose lesson starts in [from, to). */
export async function fetchEarnings(coachId: string, from: Date, to: Date): Promise<EarningsRow[]> {
  const { data } = await (supabase.from('bookings') as any)
    .select('*, slots!inner(starts_at), athletes(first_name, last_name)')
    .eq('coach_id', coachId)
    .gte('slots.starts_at', from.toISOString())
    .lt('slots.starts_at', to.toISOString());
  return ((data as EarningsRow[]) ?? []).sort((a, b) => (a.slots?.starts_at ?? '').localeCompare(b.slots?.starts_at ?? ''));
}

export interface EarningsTotals {
  booked: number; collected: number; outstanding: number; cash: number; fees: number; refunded: number; lessons: number;
}

const OFFLINE = ['cash', 'venmo', 'zelle', 'other'];

export function earningsTotals(rows: EarningsRow[]): EarningsTotals {
  const t: EarningsTotals = { booked: 0, collected: 0, outstanding: 0, cash: 0, fees: 0, refunded: 0, lessons: 0 };
  for (const r of rows) {
    if (r.status === 'cancelled' && !(r.refunded_cents ?? 0) && r.payment_status !== 'captured') continue;
    if (r.status !== 'cancelled') { t.booked += r.price_cents; t.lessons += 1; }
    t.refunded += r.refunded_cents ?? 0;
    if (r.payment_status === 'captured') {
      const amt = r.paid_amount_cents ?? r.amount_charged_cents ?? r.price_cents;
      t.collected += amt;
      if (OFFLINE.includes(r.payment_method ?? '')) t.cash += amt;
      else t.fees += r.platform_fee_cents ?? 0;
    } else if (r.status !== 'cancelled') {
      t.outstanding += r.price_cents;
    }
  }
  return t;
}

export function earningsCsv(rows: EarningsRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Lesson date', 'Athlete', 'Status', 'Price', 'Paid', 'Method', 'RallyHUB fee', 'Refunded', 'Paid on'];
  const lines = rows.map((r) => [
    r.slots?.starts_at ? new Date(r.slots.starts_at).toISOString().slice(0, 10) : '',
    r.athletes ? `${r.athletes.first_name} ${r.athletes.last_name ?? ''}`.trim() : '',
    `${r.status}/${r.payment_status}`,
    (r.price_cents / 100).toFixed(2),
    r.payment_status === 'captured' ? ((r.paid_amount_cents ?? r.amount_charged_cents ?? r.price_cents) / 100).toFixed(2) : '0.00',
    r.payment_method ?? '',
    ((r.platform_fee_cents ?? 0) / 100).toFixed(2),
    ((r.refunded_cents ?? 0) / 100).toFixed(2),
    r.paid_at ? r.paid_at.slice(0, 10) : '',
  ].map(esc).join(','));
  return [header.map(esc).join(','), ...lines].join('\n');
}
