import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { Ionicons } from '@expo/vector-icons';
import type { Coach, Facility, FacilityStatus, SessionType, SessionKind, Slot, SlotVisibility, ClientGroup, CoachClient, BookingRequest, Booking } from '@/types/database';

export const isSupabaseConfigured = !!(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * One color per lesson kind. Color rules (see lib/colors.ts):
 *  - sage is reserved for tournaments (TOURNAMENT_COLOR)
 *  - green / amber / red only ever mean status (done / needs attention / urgent)
 * so lesson kinds use the remaining hues. Render as a colored icon on a
 * `color + '15'` tint, or a left stripe.
 */
export const SESSION_KIND_STYLE: Record<SessionKind, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  private_1:   { label: 'Private 1:1', color: '#3B82B0', icon: 'person-outline' },
  semi_2:      { label: 'Semi-private', color: '#7c3aed', icon: 'people-outline' },
  small_group: { label: 'Small group', color: '#0891b2', icon: 'people-circle-outline' },
  clinic:      { label: 'Clinic', color: '#be185d', icon: 'school-outline' },
  camp:        { label: 'Camp', color: '#4f46e5', icon: 'flag-outline' },
};

/** Neutral style for slots open to any type / unknown kind. */
export const ANY_KIND_STYLE = { label: 'Any type', color: '#8FA8BF', icon: 'apps-outline' as const };

export function sessionKindStyle(kind?: string | null) {
  return (kind && SESSION_KIND_STYLE[kind as SessionKind]) || ANY_KIND_STYLE;
}

/** The editable listing fields a coach controls during onboarding / edit. */
export type CoachListingValues = Pick<
  Coach,
  | 'display_name' | 'bio' | 'specialties' | 'sport'
  | 'visibility' | 'cost_tier' | 'fee_handling' | 'photo_url'
  | 'phone' | 'primary_city'
>;

/** kebab-case slug + short random suffix for a unique public profile URL. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'coach';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/** 8-char invite code for private/invite-gated listings. */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Fetch the current user's coach listing (null if they don't have one yet). */
export async function fetchMyCoach(userId: string): Promise<{ data: Coach | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return { data: (data as Coach | null) ?? null, error: error ?? null };
}

export async function createCoach(
  userId: string,
  values: CoachListingValues,
): Promise<{ data: Coach | null; error: Error | null }> {
  const insert = {
    user_id: userId,
    display_name: values.display_name,
    photo_url: values.photo_url ?? null,
    bio: values.bio,
    specialties: values.specialties,
    sport: values.sport,
    visibility: values.visibility,
    cost_tier: values.cost_tier,
    fee_handling: values.fee_handling,
    slug: slugify(values.display_name),
    invite_code: generateInviteCode(), // every coach gets a shareable connect code
  };
  const { data, error } = await supabase.from('coaches').insert(insert as any).select().single();
  return { data: (data as Coach | null) ?? null, error: error ?? null };
}

export async function updateCoach(
  id: string,
  values: Partial<CoachListingValues>,
): Promise<{ data: Coach | null; error: Error | null }> {
  const { data, error } = await (supabase.from('coaches') as any)
    .update(values)
    .eq('id', id)
    .select()
    .single();
  return { data: (data as Coach | null) ?? null, error: error ?? null };
}

// ---- Facilities (1:many per coach) ----

export type FacilityValues = Pick<Facility, 'label' | 'address' | 'city' | 'notes' | 'contact'>;

export async function fetchFacilities(coachId: string): Promise<{ data: Facility[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('facilities')
    .select('*')
    .eq('coach_id', coachId)
    .eq('is_active', true) // hidden facilities stay on existing blocks only
    .order('sort_order', { ascending: true });
  return { data: (data as Facility[]) ?? [], error: error ?? null };
}

export async function createFacility(
  coachId: string,
  values: FacilityValues,
  sortOrder = 0,
): Promise<{ data: Facility | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('facilities')
    .insert({ coach_id: coachId, sort_order: sortOrder, ...values } as any)
    .select()
    .single();
  return { data: (data as Facility | null) ?? null, error: error ?? null };
}

export async function updateFacility(
  id: string,
  values: Partial<FacilityValues> & { is_active?: boolean },
): Promise<{ error: Error | null }> {
  const { error } = await (supabase.from('facilities') as any).update(values).eq('id', id);
  return { error: error ?? null };
}

/** Fails with inUse=true when availability still points at it (00070: ON DELETE RESTRICT). */
export async function deleteFacility(id: string): Promise<{ error: Error | null; inUse?: boolean }> {
  const { error } = await supabase.from('facilities').delete().eq('id', id);
  return { error: error ?? null, inUse: (error as any)?.code === '23503' };
}

// ---- Session types (what a coach offers + price) ----

export type SessionTypeValues = Pick<
  SessionType,
  'kind' | 'name' | 'description' | 'price_cents' | 'duration_min' | 'capacity' | 'booking_mode' | 'is_active'
>;

export async function fetchSessionTypes(coachId: string): Promise<{ data: SessionType[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('session_types')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: true });
  return { data: (data as SessionType[]) ?? [], error: error ?? null };
}

export async function createSessionType(
  coachId: string,
  values: SessionTypeValues,
): Promise<{ data: SessionType | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('session_types')
    .insert({ coach_id: coachId, ...values } as any)
    .select()
    .single();
  return { data: (data as SessionType | null) ?? null, error: error ?? null };
}

export async function updateSessionType(
  id: string,
  values: Partial<SessionTypeValues>,
): Promise<{ data: SessionType | null; error: Error | null }> {
  const { data, error } = await (supabase.from('session_types') as any)
    .update(values)
    .eq('id', id)
    .select()
    .single();
  return { data: (data as SessionType | null) ?? null, error: error ?? null };
}

export async function deleteSessionType(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('session_types').delete().eq('id', id);
  return { error: error ?? null };
}

// ---- Availability / slots (concrete bookable times) ----

export interface SlotWithRefs extends Slot {
  facilities?: { label: string } | null;
}

/** Build a slot insert row. starts/ends are ISO strings (UTC). */
export interface SlotTargeting {
  visibility: SlotVisibility;            // 'all' | 'individual' | 'group'
  sharedWithConnectionId?: string | null;
  sharedWithGroupId?: string | null;
}

export interface NewSlotInput extends SlotTargeting {
  coachId: string;
  facilityId: string | null;
  eligibleTypeIds: string[];   // which session types it can be booked as ([] => any)
  startsAt: Date;
  endsAt: Date;
  seatsTotal: number;          // spots (1 = exclusive/private; N = clinic/camp)
  facilityStatus?: FacilityStatus;
}

export function toSlotRow(s: NewSlotInput) {
  return {
    coach_id: s.coachId,
    facility_id: s.facilityId,
    facility_status: s.facilityStatus ?? 'not_booked',
    session_type_id: s.eligibleTypeIds[0] ?? null, // primary, for convenience
    eligible_session_type_ids: s.eligibleTypeIds,
    starts_at: s.startsAt.toISOString(),
    ends_at: s.endsAt.toISOString(),
    status: 'open',
    seats_total: s.seatsTotal,
    seats_taken: 0,
    visibility: s.visibility,
    shared_with_connection_id: s.visibility === 'individual' ? s.sharedWithConnectionId ?? null : null,
    shared_with_group_id: s.visibility === 'group' ? s.sharedWithGroupId ?? null : null,
  };
}

export async function fetchUpcomingSlots(coachId: string): Promise<{ data: SlotWithRefs[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('slots')
    .select('*, facilities(label)')
    .eq('coach_id', coachId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  return { data: (data as SlotWithRefs[]) ?? [], error: error ?? null };
}

export async function createSlots(rows: NewSlotInput[]): Promise<{ data: SlotWithRefs[]; error: Error | null }> {
  const payload = rows.map(toSlotRow);
  const { data, error } = await supabase
    .from('slots')
    .insert(payload as any)
    .select('*, facilities(label), session_types(name)');
  return { data: (data as SlotWithRefs[]) ?? [], error: error ?? null };
}

export async function fetchSlot(id: string): Promise<{ data: SlotWithRefs | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('slots')
    .select('*, facilities(label)')
    .eq('id', id)
    .single();
  return { data: (data as SlotWithRefs | null) ?? null, error: error ?? null };
}

export interface SlotUpdate {
  facility_id?: string | null;
  facility_status?: FacilityStatus;
  eligible_session_type_ids?: string[];
  starts_at?: string;
  ends_at?: string;
  seats_total?: number;
  visibility?: SlotVisibility;
  shared_with_connection_id?: string | null;
  shared_with_group_id?: string | null;
}

export async function updateSlot(id: string, values: SlotUpdate): Promise<{ error: Error | null }> {
  const { error } = await (supabase.from('slots') as any).update(values).eq('id', id);
  return { error: error ?? null };
}

export async function deleteSlot(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('slots').delete().eq('id', id);
  return { error: error ?? null };
}

// ---- Clients (roster) + segments (groups) ----

export async function fetchCoachClients(): Promise<{ data: CoachClient[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_coach_clients');
  return { data: (data as CoachClient[] | null) ?? [], error: error ?? null };
}

export async function fetchClientGroups(coachId: string): Promise<{ data: ClientGroup[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('client_groups')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: true });
  return { data: (data as ClientGroup[]) ?? [], error: error ?? null };
}

export async function createClientGroup(coachId: string, name: string): Promise<{ data: ClientGroup | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('client_groups')
    .insert({ coach_id: coachId, name } as any)
    .select()
    .single();
  return { data: (data as ClientGroup | null) ?? null, error: error ?? null };
}

export async function deleteClientGroup(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('client_groups').delete().eq('id', id);
  return { error: error ?? null };
}

export async function fetchGroupMemberIds(groupId: string): Promise<{ data: string[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('client_group_members')
    .select('connection_id')
    .eq('group_id', groupId);
  return { data: (data as { connection_id: string }[] | null)?.map((r) => r.connection_id) ?? [], error: error ?? null };
}

export async function addGroupMember(groupId: string, connectionId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('client_group_members').insert({ group_id: groupId, connection_id: connectionId } as any);
  return { error: error ?? null };
}

// ---- Client roster (00066) ----

export interface ClientAthlete {
  id: string;
  first_name: string;
  photo_url?: string | null;
  last_name: string | null;
  grad_year: number | null;
  positions: string[] | null;
  level: string | null;
  club_team: string | null;
  height_inches: number | null;
  goals: string | null;
}

export interface RosterClient {
  connection_id: string;
  status: string;
  connected_at: string;
  parent_name: string | null;
  parent_email: string | null;
  athletes: ClientAthlete[];
  group_ids: string[];
  lessons_booked: number;
  pending_requests: number;
  next_lesson_at: string | null;
  last_lesson_at: string | null;
}

// Group chips / client avatars cycle through the parent-app accent palette.
export const GROUP_COLORS = ['#3B82B0', '#7c3aed', '#0d9488', '#be185d', '#4f46e5', '#0891b2', '#1E3A5F', '#9333ea'];
export const AVATAR_COLORS = ['#3B82B0', '#7c3aed', '#0d9488', '#be185d', '#4f46e5', '#0891b2', '#1E3A5F', '#9333ea'];

/** Stable avatar color per client, so it matches across list + detail and filtering. */
export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export async function fetchClientRoster(): Promise<{ data: RosterClient[]; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('get_coach_client_roster');
  return { data: (data as RosterClient[]) ?? [], error: error ?? null };
}

/** "Drue & Miles Kenton" → falls back to parent name, then email. */
export function clientDisplayName(c: RosterClient): string {
  if (c.athletes.length) {
    const lasts = [...new Set(c.athletes.map((a) => a.last_name).filter(Boolean))];
    const firsts = c.athletes.map((a) => a.first_name).join(' & ');
    return lasts.length === 1 ? `${firsts} ${lasts[0]}` : c.athletes.map((a) => `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`).join(' & ');
  }
  return c.parent_name?.trim() || c.parent_email?.split('@')[0] || 'New client';
}

export async function removeGroupMember(groupId: string, connectionId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('client_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('connection_id', connectionId);
  return { error: error ?? null };
}

// ---- Parent side: connect, browse, book ----

export async function connectToCoach(code: string): Promise<{ data: { coach_id: string; display_name: string } | null; error: Error | null }> {
  // Timeout via Supabase's own abortSignal. A Promise.race([rpc, timeout])
  // version threw "Promise constructor's argument is not a function" on iOS.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const { data, error } = await (supabase.rpc as any)('connect_to_coach', { p_code: code.trim() })
      .abortSignal(controller.signal);
    if (error && controller.signal.aborted) {
      return { data: null, error: new Error('The connection timed out. Check your signal and try again.') };
    }
    return { data: (data as { coach_id: string; display_name: string } | null) ?? null, error: error ?? null };
  } catch (err: any) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    clearTimeout(timer);
  }
}

/** Coaches the current user is connected to (RLS returns connected + own). */
export async function fetchMyCoaches(): Promise<{ data: Coach[]; error: Error | null }> {
  const { data, error } = await supabase.from('coaches').select('*').order('display_name');
  return { data: (data as Coach[]) ?? [], error: error ?? null };
}

export async function fetchCoachById(coachId: string): Promise<{ data: Coach | null; error: Error | null }> {
  const { data, error } = await supabase.from('coaches').select('*').eq('id', coachId).maybeSingle();
  return { data: (data as Coach | null) ?? null, error: error ?? null };
}

/** Open, future, seat-available slots a connected parent can book. */
export async function fetchBookableSlots(coachId: string): Promise<{ data: SlotWithRefs[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('slots')
    .select('*, facilities(label)')
    .eq('coach_id', coachId)
    .eq('status', 'open')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  const avail = ((data as SlotWithRefs[]) ?? []).filter((s) => s.seats_taken < s.seats_total);
  return { data: avail, error: error ?? null };
}

// ---- Parent: lessons on Home + cross-coach availability ----

export interface ParentLesson {
  id: string;                       // booking_request id
  // 'cancelled' covers coach/parent cancellations; 'declined' = coach said no.
  status: 'requested' | 'accepted' | 'cancelled' | 'declined';
  change_reason?: string | null;    // coach's note on a cancellation
  athlete_id: string;
  coach_name: string;
  session_type: string | null;
  session_kind: SessionKind | null;
  starts_at: string;
  ends_at: string;
  facility: string | null;
}

/** The parent's requested + confirmed lessons starting in the next `days` days. */
export async function fetchMyUpcomingLessons(days = 30): Promise<{ data: ParentLesson[]; error: Error | null }> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('booking_requests')
    .select('id, status, athlete_id, coaches(display_name), session_types(name, kind), slots!inner(starts_at, ends_at, facilities(label)), bookings(status, change_reason)')
    // Keep cancelled/declined lessons visible (marked) so a parent who missed
    // the push still sees it on Home.
    .in('status', ['requested', 'accepted', 'cancelled', 'declined'])
    .gte('slots.starts_at', now.toISOString())
    .lte('slots.starts_at', until.toISOString());
  const rows = ((data as any[]) ?? [])
    .map((r): ParentLesson => ({
      id: r.id,
      status: (r.bookings ?? []).some((b: any) => b.status === 'cancelled') ? 'cancelled' : r.status,
      change_reason: (r.bookings ?? []).find((b: any) => b.change_reason)?.change_reason ?? null,
      athlete_id: r.athlete_id,
      coach_name: r.coaches?.display_name ?? 'Coach',
      session_type: r.session_types?.name ?? null,
      session_kind: r.session_types?.kind ?? null,
      starts_at: r.slots.starts_at,
      ends_at: r.slots.ends_at,
      facility: r.slots.facilities?.label ?? null,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { data: rows, error: error ?? null };
}

/** Parent's lesson history for the "+" sheet's rebook pattern (spec §4.2). */
export async function fetchMyLessonHistory(): Promise<{
  coachId: string; coachName: string; startsAt: string; status: string; sessionTypeId: string | null;
}[]> {
  const since = new Date(Date.now() - 49 * 86_400_000).toISOString();
  const { data } = await (supabase.from('booking_requests') as any)
    .select('coach_id, session_type_id, coaches(display_name), slots!inner(starts_at), bookings(status)')
    .eq('status', 'accepted')
    .gte('slots.starts_at', since);
  return ((data as any[]) ?? []).map((r) => ({
    coachId: r.coach_id,
    coachName: r.coaches?.display_name ?? 'Coach',
    startsAt: r.slots.starts_at,
    status: (r.bookings ?? [])[0]?.status ?? 'confirmed',
    sessionTypeId: r.session_type_id ?? null,
  }));
}

export interface CoachOpening extends SlotWithRefs {
  coach_name: string;
  coach_photo_url: string | null;
  eligible_types: SessionType[];    // resolved; all active types when the slot is open to any
}

/** Open, bookable times across every coach the parent is connected to. */
export async function fetchAllCoachAvailability(): Promise<{ data: CoachOpening[]; coaches: Coach[]; error: Error | null }> {
  const { data: coaches, error } = await fetchMyCoaches();
  if (error) return { data: [], coaches: [], error };
  const perCoach = await Promise.all(coaches.map(async (c) => {
    const [s, t] = await Promise.all([fetchBookableSlots(c.id), fetchSessionTypes(c.id)]);
    const active = t.data.filter((x) => x.is_active);
    return s.data.map((slot): CoachOpening => {
      const ids = slot.eligible_session_type_ids ?? [];
      return {
        ...slot,
        coach_name: c.display_name,
        coach_photo_url: c.photo_url ?? null,
        eligible_types: ids.length ? active.filter((x) => ids.includes(x.id)) : active,
      };
    });
  }));
  const data = perCoach.flat().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { data, coaches, error: null };
}

export async function requestBooking(args: {
  slotId: string; sessionTypeId: string; athleteId: string; notes?: string | null; filmLinks?: string[];
}): Promise<{ data: { request_id: string; booking_mode: string } | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('request_booking', {
    p_slot_id: args.slotId,
    p_session_type_id: args.sessionTypeId,
    p_athlete_id: args.athleteId,
    p_terms_version: 'v1-standard',
    p_notes: args.notes ?? null,
    p_film_links: args.filmLinks ?? [],
  });
  return { data: (data as { request_id: string; booking_mode: string } | null) ?? null, error: error ?? null };
}

/** Push the coach about a new request (notify-coach-request). Fire-and-forget — the request already exists. */
export function notifyCoachOfRequest(requestId: string): void {
  supabase.functions.invoke('notify-coach-request', { body: { request_id: requestId } })
    .then(({ error }) => { if (error) console.warn('[coach] notify failed:', error.message); });
}

export async function fetchMyRequests(): Promise<{ data: BookingRequest[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: (data as BookingRequest[]) ?? [], error: error ?? null };
}

export async function fetchMyBookings(): Promise<{ data: Booking[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: (data as Booking[]) ?? [], error: error ?? null };
}

// ---- Coach side: review requests ----

export async function fetchPendingRequests(coachId: string): Promise<{ data: BookingRequest[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'requested')
    .order('created_at', { ascending: true });
  return { data: (data as BookingRequest[]) ?? [], error: error ?? null };
}

export interface RequestDetail {
  request_id: string;
  status: string;
  notes: string | null;
  film_links: string[];
  athlete: {
    first_name: string; last_name: string | null; grad_year: number | null;
    positions: string[]; level: string | null; club_team: string | null;
    height_inches: number | null; goals: string | null;
    allergies?: string | null; medical_notes?: string | null;
    emergency_contact_name?: string | null; emergency_contact_phone?: string | null;
  };
}

export async function getRequestDetail(requestId: string): Promise<{ data: RequestDetail | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('get_coach_request_detail', { p_request_id: requestId });
  return { data: (data as RequestDetail | null) ?? null, error: error ?? null };
}

export async function acceptRequest(requestId: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('accept_booking_request', { p_request_id: requestId });
  return { error: error ?? null };
}

export async function declineRequest(requestId: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('decline_booking_request', { p_request_id: requestId, p_reason: 'declined' });
  return { error: error ?? null };
}

// ---- Schedule + calendar feed (00064) ----

export interface ScheduleAttendee {
  kind: 'booking' | 'request';
  id: string;
  status: string;
  athlete_name: string;
  parent_name: string | null;
  session_type: string | null;
  session_kind: SessionKind | null;
  notes: string | null;
  film_links: string[] | null;
  parent_email?: string | null;
  athlete_profile?: {
    grad_year: number | null; positions: string[] | null; level: string | null;
    club_team: string | null; height_inches: number | null; goals: string | null;
    allergies?: string | null; medical_notes?: string | null;
    emergency_contact_name?: string | null; emergency_contact_phone?: string | null;
  } | null;
  price_cents?: number | null;
  payment_status?: string | null;   // bookings: pending|authorized|captured|refunded|failed
  payment_method?: string | null;   // card|apple_pay|google_pay|ach|cash|venmo|zelle|other
  paid_at?: string | null;
}

export interface ScheduleItem {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  seats_total: number;
  facility_label: string | null;
  facility_address: string | null;
  facility_status?: FacilityStatus;
  status: 'booked' | 'pending';
  attendees: ScheduleAttendee[];
}

/** Slots with confirmed bookings or pending requests in [from, to). */
export async function fetchSchedule(from: Date, to: Date): Promise<{ data: ScheduleItem[]; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('get_coach_schedule', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return { data: (data as ScheduleItem[]) ?? [], error: error ?? null };
}

// ---- Coach "+" sheet helpers ----

/** Text a coach sends a family so they connect (client code) — or book from the page if published. */
export function familyInviteMessage(coach: Coach): string {
  const c = coach as any;
  const page = c.booking_page_published && coach.slug ? `https://rally-hub.com/book/${coach.slug}` : null;
  return page
    ? `${coach.display_name} invited you to book lessons on RallyHUB! 🏐\n\nSee open times and request one here: ${page}`
    : `${coach.display_name} invited you to book lessons on RallyHUB! 🏐\n\n1) Sign up: https://rally-hub.com/auth?signup=true\n2) Open the Hub tab → "My Coaches"\n3) Enter code: ${coach.invite_code ?? ''}`;
}

export interface UnpaidLesson {
  id: string;
  price_cents: number;
  payment_status: string;
  last_charge_error: string | null;
  athletes: { first_name: string; last_name: string | null } | null;
  slots: { starts_at: string; ends_at: string } | null;
}

/** Confirmed lessons not yet paid (excludes in-app charges in flight), oldest first. */
export async function fetchUnpaidLessons(coachId: string): Promise<UnpaidLesson[]> {
  const { data } = await (supabase.from('bookings') as any)
    .select('id, price_cents, payment_status, last_charge_error, athletes(first_name, last_name), slots(starts_at, ends_at)')
    .eq('coach_id', coachId)
    .in('status', ['confirmed', 'completed'])
    .in('payment_status', ['pending', 'authorized', 'failed']);
  return ((data as UnpaidLesson[]) ?? []).sort((a, b) => (a.slots?.starts_at ?? '').localeCompare(b.slots?.starts_at ?? ''));
}

/** Open, bookable blocks starting in the next 7 days. */
export async function countOpenSlotsNext7Days(coachId: string): Promise<number> {
  const now = new Date();
  const { data } = await (supabase.from('slots') as any)
    .select('id, seats_total, seats_taken')
    .eq('coach_id', coachId)
    .eq('status', 'open')
    .gte('starts_at', now.toISOString())
    .lt('starts_at', new Date(now.getTime() + 7 * 86_400_000).toISOString());
  return ((data as any[]) ?? []).filter((s) => s.seats_taken < s.seats_total).length;
}

// ---- Phase A: week revenue, payments, cancel / reschedule (00067) ----

export const FACILITY_STATUS_STYLE: Record<FacilityStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  reserved:   { label: 'Gym reserved', color: '#16a34a', icon: 'checkmark-circle' },
  requested:  { label: 'Gym requested', color: '#d97706', icon: 'time-outline' },
  not_booked: { label: 'Gym not reserved', color: '#dc2626', icon: 'alert-circle-outline' },
};

/** Every slot (open or booked) the coach has in [from, to). */
export async function fetchWeekSlots(coachId: string, from: Date, to: Date): Promise<{ data: SlotWithRefs[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('slots')
    .select('*, facilities(label)')
    .eq('coach_id', coachId)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at', { ascending: true });
  return { data: (data as SlotWithRefs[]) ?? [], error: error ?? null };
}

export type PaymentBadge = 'paid' | 'overdue' | 'unpaid' | 'pending' | 'processing' | 'failed' | 'refunded';

/** Payment state of one attendee for display. Requests aren't billable yet. */
export function paymentBadge(a: ScheduleAttendee, startsAt: string): PaymentBadge {
  if (a.kind === 'request') return 'pending';
  if (a.payment_status === 'captured') return 'paid';
  if (a.payment_status === 'processing') return 'processing';
  if (a.payment_status === 'refunded') return 'refunded';
  if (a.payment_status === 'failed') return 'failed';
  return new Date(startsAt).getTime() < Date.now() ? 'overdue' : 'unpaid';
}

export const PAYMENT_BADGE_STYLE: Record<PaymentBadge, { label: string; bg: string; fg: string }> = {
  paid:    { label: 'PAID', bg: '#16a34a1a', fg: '#16a34a' },
  processing: { label: 'PROCESSING', bg: '#3B82B01a', fg: '#3B82B0' },
  failed:  { label: 'PAYMENT FAILED', bg: '#dc26261a', fg: '#dc2626' },
  refunded: { label: 'REFUNDED', bg: '#8FA8BF26', fg: '#6B8BA8' },
  unpaid:  { label: 'UNPAID', bg: '#d977061a', fg: '#b45309' },
  overdue: { label: 'OVERDUE', bg: '#dc26261a', fg: '#dc2626' },
  pending: { label: 'REQUESTED', bg: '#d977061a', fg: '#b45309' },
};

/** Default price of a block: cheapest bookable type (per athlete for group formats). */
export function slotDefaultPrice(slot: Slot, types: SessionType[]): number {
  const active = types.filter((t) => t.is_active);
  const ids = slot.eligible_session_type_ids ?? [];
  const pool = ids.length ? active.filter((t) => ids.includes(t.id)) : active;
  return pool.length ? Math.min(...pool.map((t) => t.price_cents)) : 0;
}

export interface BlockRevenue { booked: number; pending: number; open: number; fullBook: number; }

/** Booked / open / full-book revenue for one availability block. */
export function blockRevenue(slot: Slot, types: SessionType[], item?: ScheduleItem): BlockRevenue {
  const live = (item?.attendees ?? []).filter((a) => a.kind === 'booking');
  const reqs = (item?.attendees ?? []).filter((a) => a.kind === 'request');
  const booked = live.reduce((n, a) => n + (a.price_cents ?? 0), 0);
  const pending = reqs.reduce((n, a) => n + (a.price_cents ?? 0), 0);
  const openSeats = slot.status === 'blocked' ? 0 : Math.max(slot.seats_total - slot.seats_taken - reqs.length, 0);
  const open = openSeats * slotDefaultPrice(slot, types);
  return { booked, pending, open, fullBook: booked + pending + open };
}

export interface WeekSummary {
  booked: number; pending: number; collected: number; outstanding: number;
  open: number; fullBook: number;
  availableHours: number; bookedHours: number; utilization: number | null;
  lessons: number;
}

export function weekSummary(slots: Slot[], items: ScheduleItem[], types: SessionType[]): WeekSummary {
  const byId = new Map(items.map((i) => [i.slot_id, i]));
  const s: WeekSummary = { booked: 0, pending: 0, collected: 0, outstanding: 0, open: 0, fullBook: 0, availableHours: 0, bookedHours: 0, utilization: null, lessons: 0 };
  for (const slot of slots) {
    if (slot.status === 'blocked') continue;
    const item = byId.get(slot.id);
    const r = blockRevenue(slot, types, item);
    s.booked += r.booked; s.pending += r.pending; s.open += r.open; s.fullBook += r.fullBook;
    const hours = (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 3_600_000;
    s.availableHours += hours;
    if (slot.seats_taken > 0) s.bookedHours += hours;
    for (const a of item?.attendees ?? []) {
      if (a.kind !== 'booking') continue;
      s.lessons += 1;
      if (a.payment_status === 'captured') s.collected += a.price_cents ?? 0;
      else s.outstanding += a.price_cents ?? 0;
    }
  }
  s.utilization = s.availableHours > 0 ? Math.round((s.bookedHours / s.availableHours) * 100) : null;
  return s;
}

export const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

export async function markBookingPaid(bookingId: string, method: 'cash' | 'venmo' | 'zelle' | 'other'): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('mark_booking_paid', { p_booking_id: bookingId, p_method: method });
  return { error: error ?? null };
}

export async function markBookingUnpaid(bookingId: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('mark_booking_unpaid', { p_booking_id: bookingId });
  return { error: error ?? null };
}

export async function coachCancelBooking(bookingId: string, reason: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('coach_cancel_booking', { p_booking_id: bookingId, p_reason: reason });
  if (!error) {
    notifyParentOfChange(bookingId, 'cancelled');
    // Coach cancelled → full refund of anything charged in RallyHUB (no-op otherwise).
    supabase.functions.invoke('refund-booking', { body: { booking_id: bookingId } })
      .then(({ error: e }) => { if (e) console.warn('[coach] refund failed:', e.message); });
  }
  return { error: error ?? null };
}

export async function coachRescheduleBooking(bookingId: string, newSlotId: string, reason: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('coach_reschedule_booking', { p_booking_id: bookingId, p_new_slot_id: newSlotId, p_reason: reason });
  if (!error) notifyParentOfChange(bookingId, 'rescheduled');
  return { error: error ?? null };
}

/** Push + email the parent about a coach cancel/reschedule (notify-booking-change). Fire-and-forget. */
function notifyParentOfChange(bookingId: string, change: 'cancelled' | 'rescheduled') {
  supabase.functions.invoke('notify-booking-change', { body: { booking_id: bookingId, change } })
    .then(({ error }) => { if (error) console.warn('[coach] parent notify failed:', error.message); });
}

export async function setSlotFacilityStatus(slotId: string, status: FacilityStatus): Promise<{ error: Error | null }> {
  const { error } = await (supabase.from('slots') as any).update({ facility_status: status }).eq('id', slotId);
  return { error: error ?? null };
}

// ---- Terms, release, platform agreement, athlete health (00069) ----

export interface CoachPolicies {
  coach_id: string;
  terms: string;
  release: string;
  platform: string;              // fixed RallyHUB platform terms (not coach-editable)
  terms_is_default: boolean;
  release_is_default: boolean;
  version: string;
  reviewed: boolean;
  platform_agreement_accepted_at: string | null;   // only returned to the coach themself
}

export async function fetchCoachPolicies(coachId: string): Promise<{ data: CoachPolicies | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('get_coach_policies', { p_coach_id: coachId });
  return { data: (data as CoachPolicies | null) ?? null, error: error ?? null };
}

/** Pass null to use the RallyHUB default for that document. */
export async function saveMyCoachPolicies(terms: string | null, release: string | null): Promise<{ data: CoachPolicies | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('set_my_coach_policies', { p_terms: terms, p_release: release });
  return { data: (data as CoachPolicies | null) ?? null, error: error ?? null };
}

export async function fetchCoachPlatformAgreement(): Promise<string> {
  const { data } = await (supabase.rpc as any)('coach_platform_agreement');
  return (data as string) ?? '';
}

export async function acceptCoachPlatformAgreement(): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('accept_coach_platform_agreement');
  return { error: error ?? null };
}

export async function hasAcceptedCoachPolicies(coachId: string, athleteId: string): Promise<boolean> {
  const { data } = await (supabase.rpc as any)('has_accepted_coach_policies', { p_coach_id: coachId, p_athlete_id: athleteId });
  return !!data;
}

export async function acceptCoachPolicies(coachId: string, athleteId: string, signerName: string): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('accept_coach_policies', { p_coach_id: coachId, p_athlete_id: athleteId, p_signer_name: signerName });
  return { error: error ?? null };
}

export interface AthleteHealth {
  allergies: string | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

export async function fetchAthleteHealth(athleteId: string): Promise<AthleteHealth | null> {
  const { data } = await (supabase.from('athletes') as any)
    .select('allergies, medical_notes, emergency_contact_name, emergency_contact_phone')
    .eq('id', athleteId)
    .maybeSingle();
  return (data as AthleteHealth | null) ?? null;
}

export async function saveAthleteHealth(athleteId: string, h: AthleteHealth): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('set_athlete_health', {
    p_athlete_id: athleteId,
    p_allergies: h.allergies ?? '',
    p_medical_notes: h.medical_notes ?? '',
    p_ec_name: h.emergency_contact_name ?? '',
    p_ec_phone: h.emergency_contact_phone ?? '',
  });
  return { error: error ?? null };
}

export interface PolicyAcceptance {
  id: string;
  coach_id: string;
  athlete_id: string;
  parent_user_id: string;
  signer_name: string;
  terms_text: string;
  release_text: string;
  platform_text: string;
  policies_version: string;
  accepted_at: string;
  coaches?: { display_name: string; policies_updated_at?: string } | null;
  athletes?: { first_name: string; last_name: string | null } | null;
}

/**
 * Signed terms/releases the caller can see (RLS: the signing parent, or the coach).
 * Newest first. Filter by athlete (parent view) or coach + athletes (coach view).
 */
export async function fetchAcceptances(filter: { athleteId?: string; coachId?: string; athleteIds?: string[] }): Promise<{ data: PolicyAcceptance[]; error: Error | null }> {
  let q = (supabase.from('policy_acceptances') as any)
    .select('*, coaches(display_name, policies_updated_at), athletes(first_name, last_name)')
    .order('accepted_at', { ascending: false });
  if (filter.athleteId) q = q.eq('athlete_id', filter.athleteId);
  if (filter.coachId) q = q.eq('coach_id', filter.coachId);
  if (filter.athleteIds) q = q.in('athlete_id', filter.athleteIds.length ? filter.athleteIds : ['00000000-0000-0000-0000-000000000000']);
  const { data, error } = await q;
  return { data: (data as PolicyAcceptance[]) ?? [], error: error ?? null };
}

export async function fetchAcceptance(id: string): Promise<PolicyAcceptance | null> {
  const { data } = await (supabase.from('policy_acceptances') as any)
    .select('*, coaches(display_name, policies_updated_at), athletes(first_name, last_name)')
    .eq('id', id)
    .maybeSingle();
  return (data as PolicyAcceptance | null) ?? null;
}

/** Only the newest signature per coach + athlete (older ones stay on file). */
export function latestAcceptances(rows: PolicyAcceptance[]): PolicyAcceptance[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.coach_id}:${r.athlete_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Signed an older version than the coach's current terms → will re-sign at next booking. */
export function acceptanceOutdated(r: PolicyAcceptance): boolean {
  const current = r.coaches?.policies_updated_at;
  return !!current && new Date(r.policies_version).getTime() < new Date(current).getTime();
}

/** True when the allergies answer is an actual allergy (not "none"). */
export function hasRealAllergies(allergies?: string | null): boolean {
  const a = (allergies ?? '').trim().toLowerCase();
  return !!a && !['none', 'no', 'n/a', 'na', 'nka', 'nkda', 'no known allergies'].includes(a);
}

export async function getCalendarToken(regenerate = false): Promise<{ data: string | null; error: Error | null }> {
  const fn = regenerate ? 'regenerate_my_calendar_token' : 'get_my_calendar_token';
  const { data, error } = await (supabase.rpc as any)(fn);
  return { data: (data as string | null) ?? null, error: error ?? null };
}

/** https URL of the coach's iCal feed (coach-calendar-feed edge fn). */
export function calendarFeedUrl(token: string): string {
  return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/coach-calendar-feed?token=${token}`;
}

/** Opens Google Calendar's "add calendar by URL" for the feed (Google wants webcal://). */
export function googleCalendarSubscribeUrl(token: string): string {
  const webcal = calendarFeedUrl(token).replace(/^https:/, 'webcal:');
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
}

// ---- Profile photo (expo-image-picker → Supabase Storage) ----

const COACH_PHOTOS_BUCKET = 'coach-photos';

/** RN 0.74+/Hermes and web both provide global atob. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Prompt the user to pick a square image and upload it to coach-photos/<userId>/.
 * Returns the public URL, or null if cancelled. Throws on permission/upload error.
 */
/** Same upload for every profile photo (coach, parent, athlete): <uid>/<ts>.jpg in the public bucket. */
export const pickAndUploadPhoto = (userId: string) => pickAndUploadCoachPhoto(userId);

export async function saveMyAvatar(url: string | null): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('set_my_avatar', { p_url: url ?? '' });
  return { error: error ?? null };
}

export async function saveAthletePhoto(athleteId: string, url: string | null): Promise<{ error: Error | null }> {
  const { error } = await (supabase.rpc as any)('set_athlete_photo', { p_athlete_id: athleteId, p_url: url ?? '' });
  return { error: error ?? null };
}

export async function pickAndUploadCoachPhoto(userId: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission denied');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  const bytes = base64ToBytes(asset.base64!);
  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(COACH_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(COACH_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
