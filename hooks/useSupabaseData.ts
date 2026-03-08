import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import type {
  Tournament,
  HotelBooking,
  FlightBooking,
  TeamConfig,
  TeamEvent,
  Guest,
  TournamentGuest,
  USAVProfile,
  ForwardedEmail,
} from '@/types/database';

const isConfigured = !!(
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Fetches all season data from Supabase and populates Zustand stores.
 * Returns loading/error state and a refresh function.
 */
export function useSupabaseData() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    setTournaments,
    setHotelBookings,
    setFlightBookings,
    setTeamConfig,
    setUSAVProfiles,
    setForwardedEmails,
    setLoading,
  } = useSeasonStore();

  const { setGuests, setTournamentGuests } = useGuestStore();

  const fetchAll = useCallback(async () => {
    if (!isConfigured || !user) return;

    setIsLoading(true);
    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [
        tournamentsRes,
        hotelsRes,
        flightsRes,
        configRes,
        guestsRes,
        tgRes,
        usavRes,
        emailsRes,
      ] = await Promise.all([
        supabase
          .from('tournaments')
          .select('*')
          .order('start_date', { ascending: true }),
        supabase
          .from('hotel_bookings')
          .select('*')
          .order('check_in', { ascending: true }),
        supabase
          .from('flight_bookings')
          .select('*')
          .order('departure_date', { ascending: true }),
        supabase
          .from('team_config')
          .select('*')
          .limit(1)
          .single(),
        supabase
          .from('guests')
          .select('*')
          .order('name', { ascending: true }),
        supabase
          .from('tournament_guests')
          .select('*'),
        supabase
          .from('usav_profiles')
          .select('*')
          .order('member_name', { ascending: true }),
        supabase
          .from('forwarded_emails')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(50),
      ]);

      if (tournamentsRes.error) throw tournamentsRes.error;
      if (hotelsRes.error) throw hotelsRes.error;
      if (flightsRes.error) throw flightsRes.error;
      if (guestsRes.error) throw guestsRes.error;
      if (tgRes.error) throw tgRes.error;
      // configRes might be null (no config yet) — that's ok

      setTournaments(tournamentsRes.data as Tournament[]);
      setHotelBookings(hotelsRes.data as HotelBooking[]);
      setFlightBookings(flightsRes.data as FlightBooking[]);
      setTeamConfig((configRes.data as TeamConfig | null) ?? null);
      setGuests(guestsRes.data as Guest[]);
      setTournamentGuests(tgRes.data as TournamentGuest[]);
      if (!usavRes.error && usavRes.data) {
        setUSAVProfiles(usavRes.data as USAVProfile[]);
      }
      if (!emailsRes.error && emailsRes.data) {
        setForwardedEmails(emailsRes.data as ForwardedEmail[]);
      }
    } catch (err: any) {
      console.error('Failed to fetch data:', err);
      setError(err.message ?? 'Failed to load data');
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  }, [user]);

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { isLoading, error, refresh: fetchAll, isConfigured };
}

/**
 * Hook to fetch team events for a specific tournament (or all).
 */
export function useTeamEvents(tournamentId?: string) {
  const { user } = useAuth();
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isConfigured || !user) return;

    const fetch = async () => {
      setIsLoading(true);
      let query = supabase.from('team_events').select('*').order('date');
      if (tournamentId) {
        query = query.eq('tournament_id', tournamentId);
      }
      const { data, error } = await query;
      if (!error && data) {
        setEvents(data as TeamEvent[]);
      }
      setIsLoading(false);
    };

    fetch();
  }, [user, tournamentId]);

  return { events, isLoading };
}

// ============================================================
// Mutation helpers
// ============================================================

export async function insertTournament(tournament: Omit<Tournament, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('tournaments')
    .insert(tournament as any)
    .select()
    .single();
  return { data: data as Tournament | null, error };
}

export async function updateTournament(id: string, updates: Partial<Tournament>) {
  const { data, error } = await (supabase
    .from('tournaments') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data: data as Tournament | null, error };
}

export async function insertHotelBooking(booking: Omit<HotelBooking, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('hotel_bookings')
    .insert(booking as any)
    .select()
    .single();
  return { data: data as HotelBooking | null, error };
}

export async function updateHotelBooking(id: string, updates: Partial<HotelBooking>) {
  const { data, error } = await (supabase
    .from('hotel_bookings') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data: data as HotelBooking | null, error };
}

export async function deleteHotelBooking(id: string) {
  return supabase.from('hotel_bookings').delete().eq('id', id);
}

export async function insertFlightBooking(booking: Omit<FlightBooking, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('flight_bookings')
    .insert(booking as any)
    .select()
    .single();
  return { data: data as FlightBooking | null, error };
}

export async function insertGuest(guest: Omit<Guest, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('guests')
    .insert(guest as any)
    .select()
    .single();
  return { data: data as Guest | null, error };
}

export async function upsertTournamentGuest(tg: TournamentGuest) {
  const { data, error } = await supabase
    .from('tournament_guests')
    .upsert(tg as any)
    .select()
    .single();
  return { data: data as TournamentGuest | null, error };
}

export async function updateTeamConfig(id: string, updates: Partial<TeamConfig>) {
  const { data, error } = await (supabase
    .from('team_config') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data: data as TeamConfig | null, error };
}

export async function insertUSAVProfile(profile: Omit<USAVProfile, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('usav_profiles')
    .insert(profile as any)
    .select()
    .single();
  return { data: data as USAVProfile | null, error };
}

export async function updateUSAVProfile(id: string, updates: Partial<USAVProfile>) {
  const { data, error } = await (supabase
    .from('usav_profiles') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data: data as USAVProfile | null, error };
}

export async function deleteUSAVProfile(id: string) {
  return supabase.from('usav_profiles').delete().eq('id', id);
}
