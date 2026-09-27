export type TournamentStatus = 'upcoming' | 'travel_needed' | 'booked' | 'complete';
export type BookingPlatform = 'Bonvoy' | 'Booking.com' | 'Travel Source' | 'Expedia' | 'Direct' | 'THS' | 'Other';
export type BookingStatus = 'tentative' | 'confirmed' | 'cancelled';
export type RSVPStatus = 'pending' | 'yes' | 'no' | 'maybe';
export type NotificationPref = 'sms';
export type EmailClassification = 'stay_and_play' | 'travel_confirmation' | 'coach_announcement' | 'schedule_change' | 'tournament_info' | 'unclassified' | 'other';
export type EmailAction = 'booking_alert_sent' | 'travel_import_queued' | 'notification_sent' | 'none';
export type StreamingPlatform = 'YouTube' | 'GameChanger' | 'Baller.tv' | 'Other';

// New multi-user types
export type UserRole = 'admin' | 'athlete' | 'coach';
export type AdminPermission = 'manage' | 'view';
export type InviteType = 'admin' | 'athlete';
export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface Venue {
  address: string;
  label: string;
  is_confirmed: boolean;
}

// ---- Coaching & Lessons module (00054) ----
export type CoachVisibility = 'public' | 'private';
export type FeeHandling = 'absorb' | 'surcharge';
export type CostTier = '$' | '$$' | '$$$';
export type SafeSportStatus = 'verified' | 'self_attested';
export type ConnectionStatus = 'invited' | 'active';

export interface CoachCertification {
  label: string;
  number: string | null;
  status: string | null;
}

export interface Facility {
  id: string;
  coach_id: string;
  label: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  contact?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Listing-safe facility shape returned inside get_public_coach(). */
export type PublicFacility = Pick<Facility, 'id' | 'label' | 'address' | 'city' | 'lat' | 'lng'>;

export type SessionKind = 'private_1' | 'semi_2' | 'small_group' | 'clinic' | 'camp';
export type BookingMode = 'request' | 'instant';
export type SlotStatus = 'open' | 'held' | 'booked' | 'blocked';
export type AvailabilityVisibility = 'all' | 'individual';
export type SlotVisibility = 'all' | 'individual' | 'group';
export type RequestStatus = 'requested' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'ach';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed';
export type CoachingBookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface StreamingLink {
  label: string;
  url: string;
}

export interface ExternalLink {
  label: string;
  url: string;
  icon_name: string;
  username: string | null;
  password: string | null;
  scope?: 'admin' | 'athlete';
  athlete_id?: string | null;
}

export type AccountType = 'parent' | 'coach' | 'athlete';

export interface UserProfile {
  id: string;
  role: UserRole;
  account_type: AccountType;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Athlete {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string | null;
  can_edit: boolean;
  avatar_color: string | null;
  // Athlete profile (00054) — conveyed to a coach with each booking request
  grad_year: number | null;
  positions: string[];
  level: string | null;
  club_team: string | null;
  height_inches: number | null;
  goals: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAthlete {
  id: string;
  admin_id: string;
  athlete_id: string;
  permission: AdminPermission;
  is_primary: boolean;
  created_at: string;
}

export interface Season {
  id: string;
  athlete_id: string;
  team_name: string;
  club_name: string | null;
  season_year: string;
  sport: string;
  team_code: string | null;
  schedule_import_source: 'leagueapps' | 'teamsnap' | 'manual' | null;
  schedule_import_connected: boolean;
  default_streaming_platform: StreamingPlatform | null;
  default_stream_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AthleteInvite {
  id: string;
  inviter_id: string;
  athlete_id: string;
  email: string;
  invite_type: InviteType;
  permission: AdminPermission;
  invite_code: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
}

export interface Tournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venues: Venue[];
  travel_required: boolean;
  ticket_system: string | null;
  ticket_link: string | null;
  aes_tournament_id: string | null;
  aes_feed_data: Record<string, unknown> | null;
  aes_feed_last_updated: string | null;
  aes_feed_available: boolean;
  schedule_link: string | null;
  schedule_available_date: string | null;
  ticket_sales_date: string | null;
  tickets_purchased: boolean;
  streaming_links: StreamingLink[];
  air_not_needed: boolean;
  hotel_not_needed: boolean;
  status: TournamentStatus;
  season_id: string;
  created_at: string;
}

export interface TournamentTicket {
  id: string;
  tournament_id: string;
  created_by_user_id: string;
  ticket_holder_name: string;
  ticket_type: string | null;
  ticket_id: string | null;
  order_id: string | null;
  ticket_url: string | null;
  ticket_price: number | null;
  sales_tax: number | null;
  total_cost: number | null;
  order_date: string | null;
  age_category: string | null;
  photo_required: boolean;
  refund_policy: string | null;
  parking_notes: string | null;
  source_email_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HotelBooking {
  id: string;
  tournament_id: string;
  hotel_name: string;
  platform: BookingPlatform;
  booking_name: string;
  booked_by: string;
  reservation_number: string;
  check_in: string;
  check_out: string;
  cancellation_deadline: string | null;
  cost: number | null;
  notes: string;
  is_backup: boolean;
  status: BookingStatus;
  address: string;
  created_by_user_id: string;
  created_at: string;
}

export interface FlightBooking {
  id: string;
  tournament_id: string;
  airline: string;
  confirmation_code: string;
  ticket_number: string | null;
  departure_date: string;
  return_date: string | null;
  booked_by: string;
  traveler_names: string[];
  cost: number | null;
  departure_time: string | null;
  arrival_time: string | null;
  seat_number: string | null;
  flight_number: string | null;
  created_by_user_id: string;
  created_at: string;
}

export interface Guest {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  relationship: string;
  notification_pref: NotificationPref;
  default_invited: boolean;
  athlete_id: string | null;
  created_at: string;
}

export interface TournamentGuest {
  tournament_id: string;
  guest_id: string;
  invited: boolean;
  rsvp_status: RSVPStatus;
  attending_in_person: boolean;
  ticket_purchased: boolean;
}

export interface NotificationPreferences {
  tournament_reminders: boolean;
  cancellation_deadlines: boolean;
  email_arrivals: boolean;
  rsvp_responses: boolean;
  schedule_changes: boolean;
}

export interface AdminConfig {
  id: string;
  club_email_domain: string | null;
  rally_forward_address: string;
  trusted_sender_emails: string[];
  vip_sender_emails: string[];
  ical_feed_token: string;
  youtube_channel_id: string | null;
  default_streaming_platform: StreamingPlatform | null;
  default_stream_url: string | null;
  travel_sync_emails: string[];
  gmail_connected: boolean;
  gmail_email: string | null;
  external_links: ExternalLink[];
  notification_preferences: NotificationPreferences;
  active_season_id: string | null;
  user_id: string;
  created_at: string;
}

export interface TeamEvent {
  id: string;
  tournament_id: string | null;
  name: string;
  date: string;
  time: string;
  venue_name: string;
  address: string;
  reservation_name: string | null;
  reservation_number: string | null;
  party_size: number | null;
  notes: string | null;
  family_welcome: boolean;
  season_id: string;
  created_at: string;
}

export interface USAVProfile {
  id: string;
  member_name: string;
  member_id: string;
  club_affiliation: string;
  expiration_date: string;
  membership_card_file: string | null;
  notes: string | null;
  athlete_id: string;
  created_at: string;
}

export type EmailSource = 'forward' | 'gmail_sync' | 'paste';

export interface ForwardedEmail {
  id: string;
  user_id: string;
  from_address: string;
  subject: string;
  body_text: string;
  received_at: string;
  classification: EmailClassification;
  action_taken: EmailAction;
  raw_storage_url: string | null;
  source: EmailSource;
  gmail_message_id: string | null;
  extracted_data: Record<string, unknown> | null;
}

export interface Coach {
  id: string;
  user_id: string;
  display_name: string;
  photo_url: string | null;
  bio: string | null;
  specialties: string[];
  sport: string;
  certifications: CoachCertification[];
  safesport_status: SafeSportStatus | null;
  identity_verified: boolean;
  default_timezone: string;
  visibility: CoachVisibility;
  invite_code: string | null;
  cost_tier: CostTier | null;
  fee_handling: FeeHandling;
  instant_book_default: boolean;
  cancellation_policy_version: string;
  slug: string | null;
  phone?: string | null;
  primary_city?: string | null;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

/** Listing-safe subset returned by the get_public_coach() RPC (no payout/internal fields). */
export type PublicCoach = Pick<
  Coach,
  | 'id' | 'display_name' | 'photo_url' | 'bio' | 'specialties' | 'sport'
  | 'certifications' | 'safesport_status' | 'identity_verified'
  | 'default_timezone' | 'cost_tier' | 'slug'
> & { facilities: PublicFacility[] };

export interface CoachConnection {
  id: string;
  coach_id: string;
  parent_user_id: string;
  athlete_id: string | null;
  status: ConnectionStatus;
  invited_email: string | null;
  invited_phone: string | null;
  created_at: string;
}

export interface SessionType {
  id: string;
  coach_id: string;
  kind: SessionKind;
  name: string;
  description: string | null;
  location_label: string | null;
  price_cents: number;
  duration_min: number;
  capacity: number;
  eligible_min_level: string | null;
  booking_mode: BookingMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRule {
  id: string;
  coach_id: string;
  facility_id: string | null;
  weekday: number;            // 0=Sun … 6=Sat
  start_time: string;         // 'HH:MM:SS'
  end_time: string;
  timezone: string;
  visibility: AvailabilityVisibility;
  shared_with_connection_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type FacilityStatus = 'reserved' | 'requested' | 'not_booked';

export interface Slot {
  id: string;
  coach_id: string;
  facility_id: string | null;
  session_type_id: string | null;
  eligible_session_type_ids: string[];
  facility_status?: FacilityStatus;
  starts_at: string;
  ends_at: string;
  status: SlotStatus;
  seats_total: number;
  seats_taken: number;
  visibility: SlotVisibility;
  shared_with_connection_id: string | null;
  shared_with_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientGroup {
  id: string;
  coach_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ClientGroupMember {
  group_id: string;
  connection_id: string;
}

/** Row shape from the get_coach_clients() RPC. */
export interface CoachClient {
  connection_id: string;
  athlete_id: string | null;
  athlete_name: string;
  status: string;
}

export interface BookingRequest {
  id: string;
  coach_id: string;
  parent_user_id: string;
  athlete_id: string;
  session_type_id: string;
  slot_id: string;
  notes: string | null;
  film_links: string[];
  status: RequestStatus;
  accepted_terms_version: string;
  payment_intent_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  request_id: string;
  coach_id: string;
  parent_user_id: string;
  athlete_id: string;
  slot_id: string;
  price_cents: number;
  service_fee_cents: number;
  platform_fee_cents: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  stripe_charge_id: string | null;
  reminder_sent_24h: boolean;
  reminder_sent_2h: boolean;
  status: CoachingBookingStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentEvent {
  id: string;
  booking_id: string | null;
  request_id: string | null;
  type: string;
  amount_cents: number | null;
  stripe_event_id: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface CoachingNotificationPrefs {
  user_id: string;
  sms_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Supabase Database type for typed client
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id'>>;
      };
      athletes: {
        Row: Athlete;
        Insert: Omit<Athlete, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Athlete, 'id'>>;
      };
      admin_athletes: {
        Row: AdminAthlete;
        Insert: Omit<AdminAthlete, 'id' | 'created_at'>;
        Update: Partial<Omit<AdminAthlete, 'id'>>;
      };
      seasons: {
        Row: Season;
        Insert: Omit<Season, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Season, 'id'>>;
      };
      athlete_invites: {
        Row: AthleteInvite;
        Insert: Omit<AthleteInvite, 'id' | 'created_at' | 'invite_code'>;
        Update: Partial<Omit<AthleteInvite, 'id'>>;
      };
      tournaments: {
        Row: Tournament;
        Insert: Omit<Tournament, 'id' | 'created_at'>;
        Update: Partial<Omit<Tournament, 'id'>>;
      };
      hotel_bookings: {
        Row: HotelBooking;
        Insert: Omit<HotelBooking, 'id' | 'created_at'>;
        Update: Partial<Omit<HotelBooking, 'id'>>;
      };
      flight_bookings: {
        Row: FlightBooking;
        Insert: Omit<FlightBooking, 'id' | 'created_at'>;
        Update: Partial<Omit<FlightBooking, 'id'>>;
      };
      guests: {
        Row: Guest;
        Insert: Omit<Guest, 'id' | 'created_at'>;
        Update: Partial<Omit<Guest, 'id'>>;
      };
      tournament_guests: {
        Row: TournamentGuest;
        Insert: TournamentGuest;
        Update: Partial<TournamentGuest>;
      };
      admin_config: {
        Row: AdminConfig;
        Insert: Omit<AdminConfig, 'id' | 'created_at'>;
        Update: Partial<Omit<AdminConfig, 'id'>>;
      };
      team_events: {
        Row: TeamEvent;
        Insert: Omit<TeamEvent, 'id' | 'created_at'>;
        Update: Partial<Omit<TeamEvent, 'id'>>;
      };
      usav_profiles: {
        Row: USAVProfile;
        Insert: Omit<USAVProfile, 'id' | 'created_at'>;
        Update: Partial<Omit<USAVProfile, 'id'>>;
      };
      forwarded_emails: {
        Row: ForwardedEmail;
        Insert: Omit<ForwardedEmail, 'id'>;
        Update: Partial<Omit<ForwardedEmail, 'id'>>;
      };
      coaches: {
        Row: Coach;
        Insert: Omit<Coach, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Coach, 'id'>>;
      };
      coach_connections: {
        Row: CoachConnection;
        Insert: Omit<CoachConnection, 'id' | 'created_at'>;
        Update: Partial<Omit<CoachConnection, 'id'>>;
      };
      facilities: {
        Row: Facility;
        Insert: Omit<Facility, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Facility, 'id'>>;
      };
      session_types: {
        Row: SessionType;
        Insert: Omit<SessionType, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SessionType, 'id'>>;
      };
      availability_rules: {
        Row: AvailabilityRule;
        Insert: Omit<AvailabilityRule, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<AvailabilityRule, 'id'>>;
      };
      slots: {
        Row: Slot;
        Insert: Omit<Slot, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Slot, 'id'>>;
      };
      booking_requests: {
        Row: BookingRequest;
        Insert: Omit<BookingRequest, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<BookingRequest, 'id'>>;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Booking, 'id'>>;
      };
      payment_events: {
        Row: PaymentEvent;
        Insert: Omit<PaymentEvent, 'id' | 'created_at'>;
        Update: Partial<Omit<PaymentEvent, 'id'>>;
      };
      coaching_notification_prefs: {
        Row: CoachingNotificationPrefs;
        Insert: Omit<CoachingNotificationPrefs, 'created_at' | 'updated_at'>;
        Update: Partial<CoachingNotificationPrefs>;
      };
      client_groups: {
        Row: ClientGroup;
        Insert: Omit<ClientGroup, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ClientGroup, 'id'>>;
      };
      client_group_members: {
        Row: ClientGroupMember;
        Insert: ClientGroupMember;
        Update: Partial<ClientGroupMember>;
      };
    };
    Views: {};
    Functions: {
      get_public_coach: {
        Args: { p_slug: string };
        Returns: PublicCoach | null;
      };
      request_booking: {
        Args: {
          p_slot_id: string;
          p_session_type_id: string;
          p_athlete_id: string;
          p_terms_version: string;
          p_notes?: string | null;
          p_film_links?: string[];
          p_response_hours?: number;
        };
        Returns: { request_id: string; coach_id: string; price_cents: number; booking_mode: BookingMode; success: boolean };
      };
      accept_booking_request: {
        Args: { p_request_id: string };
        Returns: { booking_id: string; payment_intent_id: string | null; success: boolean };
      };
      decline_booking_request: {
        Args: { p_request_id: string; p_reason?: string };
        Returns: { request_id: string; payment_intent_id: string | null; status: string; success: boolean };
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: { booking_id: string; cancelled_by: string; stripe_charge_id: string | null; payment_status: PaymentStatus; success: boolean };
      };
      get_coach_request_detail: {
        Args: { p_request_id: string };
        Returns: Record<string, unknown>;
      };
      get_coach_clients: {
        Args: Record<string, never>;
        Returns: CoachClient[];
      };
      connect_to_coach: {
        Args: { p_code: string };
        Returns: { coach_id: string; display_name: string; slug: string | null; success: boolean };
      };
    };
    Enums: {};
  };
}
