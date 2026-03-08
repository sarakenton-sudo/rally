import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import TournamentCard from '@/components/TournamentCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';

export default function HomeScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const teamCode = teamConfig?.team_code;

  const nextTournament = useMemo(() => {
    const upcoming = tournaments
      .filter((t) => daysUntil(t.end_date) >= 0)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0] ?? null;
  }, [tournaments]);

  const actionItems = useMemo(() => {
    const items: string[] = [];
    const needsBooking = tournaments.filter((t) => t.status === 'travel_needed');
    if (needsBooking.length > 0) {
      items.push(`${needsBooking.length} tournament${needsBooking.length > 1 ? 's' : ''} still need hotel bookings`);
    }
    const noTickets = tournaments.filter(
      (t) => !t.tickets_purchased && daysUntil(t.start_date) > 0 && daysUntil(t.start_date) <= 7
    );
    if (noTickets.length > 0) {
      items.push(`Buy tickets for ${noTickets.map((t) => t.name).join(', ')}`);
    }
    if (!teamCode) {
      items.push('Set your team ticket code for quick access');
    }
    return items;
  }, [tournaments, teamCode]);

  const ic = useIconColors();
  const teamName = teamConfig?.team_name ?? 'RALLY';
  const seasonYear = teamConfig?.season_year ?? '';

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['top']}>
      <ScrollView className="flex-1 px-4">
        <View className="flex-row items-center justify-between mt-4">
          <View>
            <Text className="text-3xl font-bold text-gray-900 dark:text-white">
              RALLY
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {teamName}{seasonYear ? ` — ${seasonYear}` : ''}
            </Text>
          </View>
          <Pressable
            className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 items-center justify-center border border-gray-100 dark:border-gray-700 active:opacity-70"
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={ic.muted} />
          </Pressable>
        </View>

        {/* Team Code Vault */}
        <View className="bg-rally-600 rounded-2xl p-5 mt-5">
          <Text className="text-xs font-medium text-rally-200 uppercase tracking-wider">
            Team Code
          </Text>
          <Text className="text-4xl font-bold text-white mt-1 tracking-widest">
            {teamCode ?? '------'}
          </Text>
          <Text className="text-xs text-rally-200 mt-2">
            {teamCode ? 'Tap to copy' : 'Tap to set your team\'s annual ticket code'}
          </Text>
        </View>

        {/* Next Tournament */}
        <View className="mt-5">
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Up Next
          </Text>
          {nextTournament ? (
            <TournamentCard
              tournament={nextTournament}
              onPress={() => router.push(`/tournament/${nextTournament.id}`)}
            />
          ) : (
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-5">
              <Text className="text-base text-gray-500 dark:text-gray-400">
                No upcoming tournaments
              </Text>
            </View>
          )}
        </View>

        {/* Action Items */}
        <View className="mt-5 mb-8">
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Action Items
          </Text>
          {actionItems.length > 0 ? (
            actionItems.map((item, i) => (
              <View
                key={i}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 flex-row items-center border border-gray-100 dark:border-gray-700"
              >
                <View className="w-2 h-2 rounded-full bg-amber-400 mr-3" />
                <Text className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {item}
                </Text>
              </View>
            ))
          ) : (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-4">
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                All caught up — no action items right now
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
