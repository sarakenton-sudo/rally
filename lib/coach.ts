import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { Ionicons } from '@expo/vector-icons';
import type { Coach, Facility, SessionType, SessionKind, Slot, SlotVisibility, ClientGroup, CoachClient, BookingRequest, Booking } from '@/types/database';

export const isSupabaseConfigured = !!(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * One color per lesson kind, drawn from the parent app's palette
 * (rally blue / purple / teal / amber / sage — see Home "Add" menu).
 * Render as a colored icon on a `color + '15'` tint, or a left stripe.
 */
export const SESSION_KIND_STYLE: Record<SessionKind, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  private_1:   { label: 'Private 1:1', color: '#3B82B0', icon: 'person-outline' },
  semi_2:      { label: 'Semi-private', color: '#7c3aed', icon: 'people-outline' },
  small_group: { label: 'Small group', color: '#0d9488', icon: 'people-circle-outline' },
  clinic:      { label: 'Clinic', color: '#d97706', icon: 'school-outline' },
  camp:        { label: 'Camp', color: '#6A9E8A', icon: 'flag-outline' },
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

export type FacilityValues = Pick<Facility, 'label' | 'address' | 'city' | 'notes'>;

export async function fetchFacilities(coachId: string): Promise<{ data: Facility[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('facilities')
    .select('*')
    .eq('coach_id', coachId)
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

export async function deleteFacility(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('facilities').delete().eq('id', id);
  return { error: error ?? null };
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
}

export function toSlotRow(s: NewSlotInput) {
  return {
    coach_id: s.coachId,
    facility_id: s.facilityId,
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
export const GROUP_COLORS = ['#3B82B0', '#7c3aed', '#0d9488', '#d97706', '#6A9E8A', '#be185d', '#4f46e5', '#ca8a04'];
export const AVATAR_COLORS = ['#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#0d9488', '#be185d', '#4f46e5', '#0891b2'];

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
  const { data, error } = await (supabase.rpc as any)('connect_to_coach', { p_code: code.trim() });
  return { data: (data as { coach_id: string; display_name: string } | null) ?? null, error: error ?? null };
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
}

export interface ScheduleItem {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  seats_total: number;
  facility_label: string | null;
  facility_address: string | null;
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
