import { useState } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';
import HotelBookingCard from '@/components/HotelBookingCard';
import FlightBookingCard from '@/components/FlightBookingCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import type { HotelBooking, FlightBooking } from '@/types/database';

type BookingItem =
  | { type: 'hotel'; data: HotelBooking }
  | { type: 'flight'; data: FlightBooking };

interface Section {
  title: string;
  tournamentId: string;
  data: BookingItem[];
}

export default function TravelScreen() {
  const ic = useIconColors();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const isLoading = useSeasonStore((s) => s.isLoading);
  const { refresh, isRefreshing } = useDataRefresh();

  const sections: Section[] = useMemo(() => {
    const map = new Map<string, Section>();

    for (const hotel of hotelBookings) {
      const t = tournaments.find((tour) => tour.id === hotel.tournament_id);
      const key = hotel.tournament_id;
      if (!map.has(key)) {
        map.set(key, { title: t?.name ?? 'Unknown Tournament', tournamentId: key, data: [] });
      }
      map.get(key)!.data.push({ type: 'hotel', data: hotel });
    }

    for (const flight of flightBookings) {
      const t = tournaments.find((tour) => tour.id === flight.tournament_id);
      const key = flight.tournament_id;
      if (!map.has(key)) {
        map.set(key, { title: t?.name ?? 'Unknown Tournament', tournamentId: key, data: [] });
      }
      map.get(key)!.data.push({ type: 'flight', data: flight });
    }

    return Array.from(map.values()).sort((a, b) => {
      const tA = tournaments.find((t) => t.id === a.tournamentId);
      const tB = tournaments.find((t) => t.id === b.tournamentId);
      return (tA?.start_date ?? '').localeCompare(tB?.start_date ?? '');
    });
  }, [tournaments, hotelBookings, flightBookings]);

  const totalHotelCost = hotelBookings.reduce((sum, h) => sum + (h.cost ?? 0), 0);
  const totalFlightCost = flightBookings.reduce((sum, f) => sum + (f.cost ?? 0), 0);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-bark items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color="#C4714A" />
        <Text className="text-sm text-stone mt-3">Loading travel...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.type}-${item.data.id}`}
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

            {(totalHotelCost > 0 || totalFlightCost > 0) && (
              <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mt-4 flex-row items-center justify-between border border-parchment dark:border-rally-900">
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
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center mt-4 mb-2">
            <Ionicons name="trophy-outline" size={16} color={ic.subtle} />
            <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === 'hotel') {
            return (
              <HotelBookingCard
                booking={item.data}
                onPress={() => router.push({ pathname: '/booking/add-hotel', params: { editId: item.data.id } })}
              />
            );
          }
          return (
            <FlightBookingCard
              booking={item.data}
              onPress={() => router.push({ pathname: '/booking/add-flight', params: { editId: item.data.id } })}
            />
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Ionicons name="airplane-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-bark dark:text-cream mt-4">
              No travel bookings yet
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1 text-center px-8">
              Add hotel and flight bookings to track reservations and cancellation deadlines.
            </Text>
          </View>
        }
      />

      {/* Add menu overlay */}
      {showAddMenu && (
        <Pressable
          className="absolute inset-0 bg-black/30"
          onPress={() => setShowAddMenu(false)}
        >
          <View className="absolute bottom-24 right-6">
            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl px-4 py-3 mb-2 flex-row items-center shadow-lg active:opacity-80"
              style={{ elevation: 4 }}
              onPress={() => {
                setShowAddMenu(false);
                router.push('/booking/add-hotel');
              }}
            >
              <Ionicons name="bed" size={20} color="#7c3aed" />
              <Text className="text-sm font-semibold text-bark dark:text-cream ml-3">Add Hotel</Text>
            </Pressable>
            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl px-4 py-3 flex-row items-center shadow-lg active:opacity-80"
              style={{ elevation: 4 }}
              onPress={() => {
                setShowAddMenu(false);
                router.push('/booking/add-flight');
              }}
            >
              <Ionicons name="airplane" size={20} color="#C4714A" />
              <Text className="text-sm font-semibold text-bark dark:text-cream ml-3">Add Flight</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* FAB */}
      <Pressable
        className="absolute bottom-6 right-6 bg-rally-600 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
        style={{ elevation: 4 }}
        onPress={() => setShowAddMenu(!showAddMenu)}
      >
        <Ionicons name={showAddMenu ? 'close' : 'add'} size={28} color="#FAF7F3" />
      </Pressable>
    </SafeAreaView>
  );
}
