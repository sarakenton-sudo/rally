import { useMemo } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, Alert, Platform, Switch } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';
import HotelBookingCard from '@/components/HotelBookingCard';
import FlightBookingCard from '@/components/FlightBookingCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useAuth } from '@/providers/AuthProvider';
import { deleteHotelBooking as deleteHotelBookingDB, deleteFlightBooking as deleteFlightBookingDB } from '@/hooks/useSupabaseData';
import { formatDateRange } from '@/lib/dates';
import ReferFriend from '@/components/ReferFriend';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import { PLANS_INBOX_EMAIL } from '@/lib/config';
import type { HotelBooking, FlightBooking } from '@/types/database';

type BookingItem =
  | { type: 'hotel'; data: HotelBooking }
  | { type: 'flight'; data: FlightBooking }
  | { type: 'flight-traveler'; travelerName: string; flights: FlightBooking[] };

interface Section {
  title: string;
  tournamentId: string;
  sectionIndex: number;
  locationCity: string;
  dateRange: string;
  data: BookingItem[];
}

const SECTION_ACCENTS = [
  { bar: 'bg-rally-600', bg: 'bg-rally-50 dark:bg-rally-900/10' },
  { bar: 'bg-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/10' },
  { bar: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10' },
  { bar: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-900/10' },
  { bar: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/10' },
  { bar: 'bg-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/10' },
];

export default function TravelScreen() {
  const otherEmails = useSeasonStore((st) => st.adminConfig?.trusted_sender_emails?.length ?? 0);
  const ic = useIconColors();
  const allTournaments = useSeasonStore((s) => s.tournaments);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const tournaments = useMemo(() =>
    activeSeasonId ? allTournaments.filter((t) => t.season_id === activeSeasonId) : allTournaments,
    [allTournaments, activeSeasonId]
  );
  const allHotelBookings = useSeasonStore((s) => s.hotelBookings);
  const allFlightBookings = useSeasonStore((s) => s.flightBookings);
  // Filter bookings to tournaments in active season
  const seasonTournamentIds = useMemo(() => new Set(tournaments.map((t) => t.id)), [tournaments]);
  const hotelBookings = useMemo(() =>
    allHotelBookings.filter((h) => seasonTournamentIds.has(h.tournament_id)),
    [allHotelBookings, seasonTournamentIds]
  );
  const flightBookings = useMemo(() =>
    allFlightBookings.filter((f) => seasonTournamentIds.has(f.tournament_id)),
    [allFlightBookings, seasonTournamentIds]
  );
  const isLoading = useSeasonStore((s) => s.isLoading);
  const removeHotelBooking = useSeasonStore((s) => s.removeHotelBooking);
  const removeFlightBooking = useSeasonStore((s) => s.removeFlightBooking);
  const hideTravelCosts = useSeasonStore((s) => s.hideTravelCosts);
  const setHideTravelCosts = useSeasonStore((s) => s.setHideTravelCosts);
  const { refresh, isRefreshing } = useDataRefresh();
  const { user } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const handleDeleteHotel = (hotelId: string, hotelName: string) => {
    const doDelete = async () => {
      if (isSupabaseConfigured && user) await deleteHotelBookingDB(hotelId);
      removeHotelBooking(hotelId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete hotel "${hotelName}"?`)) doDelete();
    } else {
      Alert.alert('Delete Hotel', `Delete "${hotelName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleDeleteFlight = (flightId: string, airline: string) => {
    const doDelete = async () => {
      if (isSupabaseConfigured && user) await deleteFlightBookingDB(flightId);
      removeFlightBooking(flightId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${airline} flight?`)) doDelete();
    } else {
      Alert.alert('Delete Flight', `Delete ${airline} flight?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const sections: Section[] = useMemo(() => {
    const map = new Map<string, Section>();

    for (const hotel of hotelBookings) {
      const t = tournaments.find((tour) => tour.id === hotel.tournament_id);
      const key = hotel.tournament_id;
      if (!map.has(key)) {
        map.set(key, {
          title: t?.name ?? 'Unknown Tournament',
          tournamentId: key,
          sectionIndex: 0,
          locationCity: t?.location_city ?? '',
          dateRange: t ? formatDateRange(t.start_date, t.end_date) : '',
          data: [],
        });
      }
      map.get(key)!.data.push({ type: 'hotel', data: hotel });
    }

    // Group flights by tournament, then by traveler name
    const flightsByTournament = new Map<string, Map<string, { displayName: string; flights: FlightBooking[] }>>();
    for (const flight of flightBookings) {
      if (!flightsByTournament.has(flight.tournament_id)) {
        flightsByTournament.set(flight.tournament_id, new Map());
      }
      const travelerMap = flightsByTournament.get(flight.tournament_id)!;
      for (const name of flight.traveler_names) {
        const key = name.toLowerCase().trim();
        const existing = travelerMap.get(key);
        if (existing) {
          existing.flights.push(flight);
        } else {
          const display = name.trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
          travelerMap.set(key, { displayName: display, flights: [flight] });
        }
      }
    }

    for (const [tournamentId, travelerMap] of flightsByTournament) {
      const t = tournaments.find((tour) => tour.id === tournamentId);
      if (!map.has(tournamentId)) {
        map.set(tournamentId, {
          title: t?.name ?? 'Unknown Tournament',
          tournamentId,
          sectionIndex: 0,
          locationCity: t?.location_city ?? '',
          dateRange: t ? formatDateRange(t.start_date, t.end_date) : '',
          data: [],
        });
      }
      const sortedTravelers = Array.from(travelerMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
      for (const { displayName, flights } of sortedTravelers) {
        map.get(tournamentId)!.data.push({ type: 'flight-traveler', travelerName: displayName, flights });
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => {
      const tA = tournaments.find((t) => t.id === a.tournamentId);
      const tB = tournaments.find((t) => t.id === b.tournamentId);
      return (tA?.start_date ?? '').localeCompare(tB?.start_date ?? '');
    });
    sorted.forEach((s, i) => { s.sectionIndex = i; });
    return sorted;
  }, [tournaments, hotelBookings, flightBookings]);

  const totalHotelCost = hotelBookings.reduce((sum, h) => sum + (h.cost ?? 0), 0);
  const totalFlightCost = flightBookings.reduce((sum, f) => sum + (f.cost ?? 0), 0);

  if (isLoading) {
    return (
      <View className="flex-1 bg-cream dark:bg-bark items-center justify-center">
        <ActivityIndicator size="large" color="#3B82B0" />
        <Text className="text-sm text-stone mt-3">Loading travel...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.type === 'flight-traveler' ? `traveler-${item.travelerName}-${item.flights[0]?.id}` : `${item.type}-${item.data.id}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        onRefresh={refresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View className="mb-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">Travel</Text>
                <Text className="text-sm text-stone dark:text-parchment mt-1">
                  {hotelBookings.length} hotel{hotelBookings.length !== 1 ? 's' : ''} · {flightBookings.length} flight{flightBookings.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Forwarding: the fastest way in, plus the inbox and other addresses */}
            <View className="rounded-2xl p-4 mt-4" style={{ backgroundColor: '#FFF1EC', borderWidth: 1, borderColor: '#FF7A5955' }}>
              <View className="flex-row items-center">
                <Ionicons name="mail" size={18} color="#E85F3D" />
                <Text className="text-sm font-bold text-bark ml-2 flex-1">Forward confirmations to {PLANS_INBOX_EMAIL}</Text>
              </View>
              <Text className="text-xs text-stone mt-1">
                Hotels and flights land here, matched to your tournaments.
                {otherEmails ? ` Watching ${otherEmails + 1} of your addresses.` : ' Book from another email too? Add it so we know it\'s you.'}
              </Text>
              <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                <Pressable onPress={async () => { await Clipboard.setStringAsync(PLANS_INBOX_EMAIL); showToast(`${PLANS_INBOX_EMAIL} copied`); }} className="flex-row items-center rounded-full px-3 py-2 active:opacity-80" style={{ backgroundColor: '#FF7A59' }} accessibilityLabel="Copy forwarding address">
                  <Ionicons name="copy-outline" size={14} color="#fff" />
                  <Text className="text-xs font-bold text-white ml-1">Copy address</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/settings/trusted-emails')} className="flex-row items-center rounded-full px-3 py-2 bg-white border active:opacity-80" style={{ borderColor: '#FF7A59' }} accessibilityLabel="Add my other email addresses">
                  <Ionicons name="at" size={14} color="#E85F3D" />
                  <Text className="text-xs font-bold ml-1" style={{ color: '#E85F3D' }}>{otherEmails ? 'My email addresses' : 'Add my other emails'}</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/email/inbox')} className="flex-row items-center rounded-full px-3 py-2 bg-white border active:opacity-80" style={{ borderColor: '#FF7A5955' }} accessibilityLabel="View inbox">
                  <Ionicons name="file-tray-outline" size={14} color="#E85F3D" />
                  <Text className="text-xs font-bold ml-1" style={{ color: '#E85F3D' }}>View inbox</Text>
                </Pressable>
              </View>
            </View>

            {(totalHotelCost > 0 || totalFlightCost > 0) && !hideTravelCosts && (
              <View
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mt-4 flex-row items-center justify-between border border-parchment dark:border-rally-900"
                style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
              >
                <View>
                  <Text className="text-xs text-stone uppercase tracking-wider">Season Total</Text>
                  <Text className="text-xl font-bold text-bark dark:text-cream mt-0.5">
                    ${(totalHotelCost + totalFlightCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View className="flex-row">
                  <View className="items-end mr-4">
                    <Text className="text-xs text-stone">Hotels</Text>
                    <Text className="text-sm font-semibold text-bark dark:text-parchment">
                      ${totalHotelCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs text-stone">Flights</Text>
                    <Text className="text-sm font-semibold text-bark dark:text-parchment">
                      ${totalFlightCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Hide costs toggle */}
            {(totalHotelCost > 0 || totalFlightCost > 0) && (
              <Pressable
                className="flex-row items-center mt-3"
                onPress={() => setHideTravelCosts(!hideTravelCosts)}
              >
                <Switch
                  value={hideTravelCosts}
                  onValueChange={setHideTravelCosts}
                  trackColor={{ false: '#D8E2EC', true: '#6A9E8A' }}
                  thumbColor="#FEFEFE"
                  style={{ transform: [{ scale: 0.75 }], marginRight: 4 }}
                />
                <Text className="text-xs text-stone dark:text-parchment">
                  Hide costs for my mental health
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => {
          const accent = SECTION_ACCENTS[section.sectionIndex % SECTION_ACCENTS.length];
          return (
            <View className={`mt-5 rounded-t-xl overflow-hidden ${accent.bg}`}>
              <View className={`h-1.5 ${accent.bar}`} />
              <View className="px-4 pt-3 pb-2">
                <Text className="text-base font-bold text-bark dark:text-cream">
                  {section.title}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  {section.locationCity ? (
                    <>
                      <Ionicons name="location-outline" size={12} color="#8FA8BF" />
                      <Text className="text-xs text-stone dark:text-parchment ml-1 mr-3">{section.locationCity}</Text>
                    </>
                  ) : null}
                  {section.dateRange ? (
                    <>
                      <Ionicons name="calendar-outline" size={12} color="#8FA8BF" />
                      <Text className="text-xs text-stone dark:text-parchment ml-1">{section.dateRange}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
        renderSectionFooter={() => (
          <View className="h-1 rounded-b-xl bg-parchment/30 dark:bg-bark-light/30 mb-1" />
        )}
        renderItem={({ item, section }) => {
          const accent = SECTION_ACCENTS[section.sectionIndex % SECTION_ACCENTS.length];
          if (item.type === 'hotel') {
            return (
              <View className={`px-2 pb-1 ${accent.bg}`}>
                <HotelBookingCard
                  booking={item.data}
                  onPress={() => router.push({ pathname: '/booking/hotel-detail', params: { id: item.data.id } })}
                  onDelete={() => handleDeleteHotel(item.data.id, item.data.hotel_name)}
                />
              </View>
            );
          }
          if (item.type === 'flight-traveler') {
            return (
              <View className={`px-2 pb-1 ${accent.bg}`}>
                <View className="flex-row items-center mb-1 mt-1">
                  <Ionicons name="person" size={13} color="#3B82B0" />
                  <Text className="text-xs font-semibold text-rally-700 dark:text-rally-300 ml-1.5 uppercase tracking-wider">{item.travelerName}</Text>
                </View>
                {item.flights.map((f) => (
                  <FlightBookingCard
                    key={f.id}
                    booking={f}
                    singleTraveler={item.travelerName}
                    onPress={() => router.push({ pathname: '/booking/flight-detail', params: { id: f.id } })}
                    onDelete={() => handleDeleteFlight(f.id, f.airline)}
                  />
                ))}
              </View>
            );
          }
          return (
            <View className={`px-2 pb-1 ${accent.bg}`}>
              <FlightBookingCard
                booking={item.data}
                onPress={() => router.push({ pathname: '/booking/flight-detail', params: { id: item.data.id } })}
                onDelete={() => handleDeleteFlight(item.data.id, item.data.airline)}
              />
            </View>
          );
        }}
        ListFooterComponent={() => <ReferFriend />}
        ListEmptyComponent={
          <View className="pt-6">
            <View className="items-center mb-5">
              <Ionicons name="airplane-outline" size={40} color={ic.placeholder} />
              <Text className="text-lg font-semibold text-bark dark:text-cream mt-3">No travel yet</Text>
              <Text className="text-sm text-stone dark:text-parchment mt-1 text-center px-6">
                Hotels and flights show up here with confirmation numbers and cancellation deadlines. Add them any of these ways:
              </Text>
            </View>
            {([
              ['mail-outline', 'Forward a confirmation email', `Send it to ${PLANS_INBOX_EMAIL}. Tap to copy the address.`, async () => { await Clipboard.setStringAsync(PLANS_INBOX_EMAIL); showToast(`${PLANS_INBOX_EMAIL} copied`); }],
              ['document-text-outline', 'Paste a confirmation', 'Copy the text of any booking email or page.', () => router.push('/import/paste-combined')],
              ['bed-outline', 'Add a hotel', 'Type it in yourself.', () => router.push('/booking/add-hotel')],
              ['airplane-outline', 'Add a flight', 'Type it in yourself.', () => router.push('/booking/add-flight')],
            ] as const).map(([icon, title, sub, onPress]) => (
              <Pressable
                key={title}
                onPress={onPress}
                className="flex-row items-center bg-warm-white dark:bg-bark-light rounded-2xl px-4 py-3 mb-2 border border-parchment dark:border-rally-900 active:opacity-80"
                accessibilityLabel={title}
              >
                <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#FFF1EC' }}>
                  <Ionicons name={icon} size={18} color="#E85F3D" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
                  <Text className="text-xs text-stone dark:text-parchment mt-0.5">{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={ic.placeholder} />
              </Pressable>
            ))}
          </View>
        }
      />

    </View>
  );
}
