export type TournamentStatus = 'upcoming' | 'travel_needed' | 'booked' | 'complete';
export type BookingPlatform = 'Bonvoy' | 'Booking.com' | 'Travel Source' | 'Expedia' | 'Direct' | 'Other';
export type BookingStatus = 'tentative' | 'confirmed' | 'cancelled';
export type RSVPStatus = 'pending' | 'yes' | 'no' | 'maybe';
export type NotificationPref = 'sms';
export type EmailClassification = 'stay_and_play' | 'travel_confirmation' | 'coach_announcement' | 'schedule_change' | 'tournament_info' | 'other';
export type EmailAction = 'booking_alert_sent' | 'travel_import_queued' | 'notification_sent' | 'none';
export type StreamingPlatform = 'YouTube' | 'GameChanger' | 'Baller.tv' | 'Other';

export interface Venue {
  address: string;
  label: string;
  is_confirmed: boolean;
}

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
  user_id: string;
  created_at: string;
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
  is_backup: boolean;
  status: BookingStatus;
  user_id: string;
  created_at: string;
}

export interface FlightBooking {
  id: string;
  tournament_id: string;
  airline: string;
  confirmation_code: string;
  ticket_number: string | null;
  departure_date: string;
  return_date: string;
  booked_by: string;
  traveler_names: string[];
  cost: number | null;
  user_id: string;
  created_at: string;
}

export interface Guest {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relationship: string;
  notification_pref: NotificationPref;
  default_invited: boolean;
  user_id: string;
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

export interface TeamConfig {
  id: string;
  team_name: string;
  club_name: string | null;
  season_year: string;
  team_code: string | null;
  athlete_name: string | null;
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
  schedule_import_source: 'leagueapps' | 'teamsnap' | 'manual' | null;
  schedule_import_connected: boolean;
  external_links: ExternalLink[];
  notification_preferences: NotificationPreferences;
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
  user_id: string;
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
  user_id: string;
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

export type HouseholdRole = 'admin' | 'member';
export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface HouseholdMember {
  id: string;
  owner_user_id: string;
  member_user_id: string;
  role: HouseholdRole;
  created_at: string;
}

export interface HouseholdInvite {
  id: string;
  owner_user_id: string;
  email: string;
  invite_code: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
}

// Supabase Database type for typed client
export interface Database {
  public: {
    Tables: {
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
      team_config: {
        Row: TeamConfig;
        Insert: Omit<TeamConfig, 'id' | 'created_at'>;
        Update: Partial<Omit<TeamConfig, 'id'>>;
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
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
