import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import TournamentCard from '@/components/TournamentCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import type { Tournament } from '@/types/database';

export default function SeasonScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const isLoading = useSeasonStore((s) => s.isLoading);
  const { refresh, isRefreshing } = useDataRefresh();

  const sorted = useMemo(
    () => [...tournaments].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [tournaments]
  );

  const teamName = teamConfig?.team_name ?? '';
  const seasonYear = teamConfig?.season_year ?? '';

  const renderItem = ({ item }: { item: Tournament }) => (
    <TournamentCard
      tournament={item}
      onPress={() => router.push(`/tournament/${item.id}`)}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-sm text-gray-400 mt-3">Loading season...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['top']}>
      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onRefresh={refresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View className="mb-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                Season
              </Text>
              <Pressable
                className="flex-row items-center bg-rally-50 dark:bg-rally-900/30 px-3 py-1.5 rounded-lg active:opacity-70"
                onPress={() => router.push('/import/paste')}
              >
                <Ionicons name="sparkles" size={14} color="#2563eb" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">Import</Text>
              </Pressable>
            </View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {teamName}{seasonYear ? ` — ${seasonYear}` : ''} — {sorted.length} tournaments
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              No tournaments yet
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center px-8">
              Import your season schedule from LeagueApps, TeamSnap, or paste it from a coach's message.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
