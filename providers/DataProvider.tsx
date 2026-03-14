import { useEffect, createContext, useContext, useCallback, useState, type ReactNode } from 'react';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import {
  MOCK_TOURNAMENTS,
  MOCK_HOTEL_BOOKINGS,
  MOCK_FLIGHT_BOOKINGS,
  MOCK_GUESTS,
  MOCK_TOURNAMENT_GUESTS,
  MOCK_USAV_PROFILES,
  MOCK_EXTERNAL_LINKS,
  MOCK_FORWARDED_EMAILS,
} from '@/lib/mock-data';

interface DataContextValue {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const DataContext = createContext<DataContextValue>({
  refresh: async () => {},
  isRefreshing: false,
});

export function useDataRefresh() {
  return useContext(DataContext);
}

/**
 * Initializes data — from Supabase if configured, mock data otherwise.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const { isConfigured, refresh: supabaseRefresh } = useSupabaseData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const setTournaments = useSeasonStore((s) => s.setTournaments);
  const setHotelBookings = useSeasonStore((s) => s.setHotelBookings);
  const setFlightBookings = useSeasonStore((s) => s.setFlightBookings);
  const setUSAVProfiles = useSeasonStore((s) => s.setUSAVProfiles);
  const setForwardedEmails = useSeasonStore((s) => s.setForwardedEmails);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const guests = useGuestStore((s) => s.guests);
  const setGuests = useGuestStore((s) => s.setGuests);
  const setTournamentGuests = useGuestStore((s) => s.setTournamentGuests);

  useEffect(() => {
    if (!isConfigured && tournaments.length === 0) {
      setTournaments(MOCK_TOURNAMENTS);
      setHotelBookings(MOCK_HOTEL_BOOKINGS);
      setFlightBookings(MOCK_FLIGHT_BOOKINGS);
      setUSAVProfiles(MOCK_USAV_PROFILES);
      setForwardedEmails(MOCK_FORWARDED_EMAILS);
      if (!adminConfig) {
        const mockSeasonId = 'season-mock-001';
        setAdminConfig({
          id: 'tc-mock-001',
          user_id: '00000000-0000-0000-0000-000000000001',
          club_email_domain: 'austinjuniors.com',
          rally_forward_address: 'plans@rally-hub.com',
          trusted_sender_emails: [],
          vip_sender_emails: [],
          notification_preferences: {
            tournament_reminders: true,
            cancellation_deadlines: true,
            email_arrivals: true,
            rsvp_responses: true,
            schedule_changes: true,
          },
          ical_feed_token: 'mock-ical-token',
          youtube_channel_id: null,
          default_streaming_platform: null,
          default_stream_url: null,
          travel_sync_emails: [],
          gmail_connected: false,
          gmail_email: null,
          external_links: MOCK_EXTERNAL_LINKS,
          active_season_id: mockSeasonId,
          created_at: '',
        });
        setActiveSeasonId(mockSeasonId);
      }
    }
  }, [isConfigured, tournaments.length]);

  useEffect(() => {
    if (!isConfigured && guests.length === 0) {
      setGuests(MOCK_GUESTS);
      setTournamentGuests(MOCK_TOURNAMENT_GUESTS);
    }
  }, [isConfigured, guests.length]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    if (isConfigured) {
      await supabaseRefresh();
    } else {
      // Mock mode: simulate a brief refresh
      await new Promise((r) => setTimeout(r, 500));
    }
    setIsRefreshing(false);
  }, [isConfigured, supabaseRefresh]);

  return (
    <DataContext.Provider value={{ refresh, isRefreshing }}>
      {children}
    </DataContext.Provider>
  );
}
