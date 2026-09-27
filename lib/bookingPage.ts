import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { SessionKind } from '@/types/database';

export const SITE = 'https://rally-hub.com';

export interface BookingPageData {
  coach: {
    id: string; slug: string; display_name: string; headline: string | null; photo_url: string | null;
    bio: string | null; specialties: string[] | null; sport: string | null; primary_city: string | null;
    certifications: { label: string; number?: string; status?: string }[] | null;
    safesport_status: string | null; identity_verified: boolean; accepts_payments: boolean;
    accent_color: string | null; fee_handling: string; payment_timing: string;
  };
  session_types: { id: string; name: string; kind: SessionKind; description: string | null; price_cents: number; duration_min: number; capacity: number }[];
  facilities: { id: string; label: string; city: string | null }[];
  slots: { id: string; starts_at: string; ends_at: string; seats_left: number; seats_total: number; eligible_session_type_ids: string[]; facility_id: string | null }[];
}

export async function fetchBookingPage(slug: string): Promise<BookingPageData | null> {
  const { data } = await (supabase.rpc as any)('get_booking_page', { p_slug: slug });
  return (data as BookingPageData | null) ?? null;
}

export async function setMyBookingPage(v: { published: boolean; slug: string; headline: string; accent: string }) {
  const { data, error } = await (supabase.rpc as any)('set_my_booking_page', {
    p_published: v.published, p_slug: v.slug, p_headline: v.headline, p_accent: v.accent,
  });
  return { data: data as { slug: string; published: boolean } | null, error: error ?? null };
}

/** Signed-in visitor becomes the coach's client; returns coach id. */
export async function connectViaBookingPage(slug: string) {
  const { data, error } = await (supabase.rpc as any)('connect_via_booking_page', { p_slug: slug });
  return { coachId: (data as string | null) ?? null, error: error ?? null };
}

export async function createLessonAthlete(v: { firstName: string; lastName: string; gradYear: string; position: string; club: string }) {
  const { data, error } = await (supabase.rpc as any)('create_lesson_athlete', {
    p_first_name: v.firstName,
    p_last_name: v.lastName || null,
    p_grad_year: parseInt(v.gradYear, 10) || null,
    p_positions: v.position.trim() ? [v.position.trim()] : [],
    p_club_team: v.club || null,
  });
  return { athleteId: (data as string | null) ?? null, error: error ?? null };
}

export const bookingPageUrl = (slug: string) => `${SITE}/book/${slug}`;

/** QR image for the page (rendered by a public QR service; no data beyond the URL). */
export const qrImageUrl = (url: string, size = 480) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(url)}`;

export function embedSnippet(slug: string, opts: { theme: 'light' | 'dark'; accent: string }) {
  const src = `${bookingPageUrl(slug)}?embed=1&theme=${opts.theme}&accent=${encodeURIComponent(opts.accent.replace('#', ''))}`;
  return `<iframe src="${src}" title="Book a lesson" style="width:100%;max-width:720px;height:820px;border:0;border-radius:16px;" loading="lazy"></iframe>`;
}

export function bookButtonSnippet(slug: string, accent: string) {
  return `<a href="${bookingPageUrl(slug)}" target="_blank" rel="noopener" style="display:inline-block;background:${accent};color:#fff;font-weight:700;font-family:system-ui,sans-serif;padding:12px 24px;border-radius:12px;text-decoration:none;">Book a lesson</a>`;
}

// After sign-up/sign-in, send the visitor back to the page they came from.
const NEXT_KEY = 'rally.nextAfterAuth';
export function rememberNextPath(path: string) {
  if (Platform.OS === 'web') { try { localStorage.setItem(NEXT_KEY, JSON.stringify({ path, at: Date.now() })); } catch {} }
}
export function takeNextPath(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Date.now() - v.at < 60 * 60 * 1000 && typeof v.path === 'string' && v.path.startsWith('/') ? v.path : null;
  } catch { return null; }
}
