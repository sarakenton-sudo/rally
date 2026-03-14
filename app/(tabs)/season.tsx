import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import TournamentCard from '@/components/TournamentCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { daysUntil } from '@/lib/dates';
import type { Tournament } from '@/types/database';

type ListItem = { type: 'tournament'; data: Tournament } | { type: 'divider'; label: string };

export default function SeasonScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const isLoading = useSeasonStore((s) => s.isLoading);
  const { refresh, isRefreshing } = useDataRefresh();
  const ic = useIconColors();

  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);

  // Filter tournaments to active season
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  const listItems = useMemo(() => {
    const upcoming = seasonTournaments
      .filter((t) => daysUntil(t.end_date) >= 0)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const past = seasonTournaments
      .filter((t) => daysUntil(t.end_date) < 0)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    const items: ListItem[] = upcoming.map((t) => ({ type: 'tournament' as const, data: t }));
    if (past.length > 0) {
      items.push({ type: 'divider' as const, label: 'COMPLETED' });
      past.forEach((t) => items.push({ type: 'tournament' as const, data: t }));
    }
    return items;
  }, [seasonTournaments]);

  const teamName = activeSeason?.team_name ?? '';
  const seasonYear = activeSeason?.season_year ?? '';

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'divider') {
      return (
        <View className="py-3 mt-2">
          <Text className="text-xs font-semibold text-stone uppercase tracking-wider">
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <TournamentCard
        tournament={item.data}
        hotelCount={hotelBookings.filter((h) => h.tournament_id === item.data.id).length}
        flightCount={flightBookings.filter((f) => f.tournament_id === item.data.id).length}
        backupHotelCount={hotelBookings.filter((h) => h.tournament_id === item.data.id && h.is_backup).length}
        onPress={() => router.push(`/tournament/${item.data.id}`)}
      />
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-cream dark:bg-bark items-center justify-center">
        <ActivityIndicator size="large" color="#3B82B0" />
        <Text className="text-sm text-stone mt-3">Loading season...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <FlatList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.type === 'tournament' ? item.data.id : `divider-${index}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onRefresh={refresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View className="mb-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
                Season
              </Text>
              <View className="flex-row items-center gap-2">
                <Pressable
                  className="flex-row items-center bg-rally-50 dark:bg-rally-900/30 px-3 py-1.5 rounded-lg active:opacity-70"
                  onPress={() => router.push('/import/paste')}
                >
                  <Ionicons name="sparkles" size={14} color="#3B82B0" />
                  <Text className="text-xs font-semibold text-rally-600 ml-1">Paste</Text>
                </Pressable>
                <Pressable
                  className="flex-row items-center bg-rally-50 dark:bg-rally-900/30 px-3 py-1.5 rounded-lg active:opacity-70"
                  onPress={() => router.push('/settings/schedule-import')}
                >
                  <Ionicons name="mail" size={14} color="#3B82B0" />
                  <Text className="text-xs font-semibold text-rally-600 ml-1">Auto Import</Text>
                </Pressable>
              </View>
            </View>
            <Text className="text-sm text-stone dark:text-parchment mt-1">
              {teamName}{seasonYear ? ` — ${seasonYear}` : ''} — {tournaments.length} tournaments
            </Text>
            <Text className="text-xs font-semibold text-stone uppercase tracking-wider mt-4">
              Tournaments
            </Text>
          </View>
        }
        ListFooterComponent={
          activeSeason ? (
            <View className="mt-6">
              <HubSectionHeader
                icon="settings"
                title={`${activeSeason.team_name} Settings`}
                iconColor={ic.muted}
              />

              <HubSettingsRow
                icon="information-circle"
                iconColor="#3B82B0"
                title="Team Details"
                subtitle={`${activeSeason.club_name ? activeSeason.club_name + ' · ' : ''}${activeSeason.season_year}`}
                onPress={() => router.push('/settings/team-details')}
              />

              <HubSettingsRow
                icon="calendar"
                iconColor="#6A9E8A"
                title="Tournament Schedule Import"
                subtitle="Import from coach emails, copy/paste, or direct sync"
                onPress={() => router.push('/settings/schedule-import')}
              />

              {activeSeason.default_stream_url ? (
                <Pressable
                  className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 active:opacity-80"
                  style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                  onPress={() => router.push('/settings/streaming-hub')}
                >
                  <View className="flex-row items-center">
                    <Ionicons name="play-circle" size={24} color="#dc2626" />
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-bark dark:text-cream">
                        {activeSeason.default_streaming_platform ?? 'Stream'}
                      </Text>
                      <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>
                        {activeSeason.default_stream_url}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                  </View>
                </Pressable>
              ) : (
                <HubSettingsRow
                  icon="videocam"
                  iconColor="#dc2626"
                  title="Default Stream Channel"
                  subtitle="YouTube, GameChanger, Baller.tv, or other"
                  onPress={() => router.push('/settings/streaming-hub')}
                />
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Text className="text-lg font-semibold text-bark dark:text-cream">
              No tournaments yet
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1 text-center px-8">
              Import your season schedule from LeagueApps, TeamSnap, or paste it from a coach's message.
            </Text>
          </View>
        }
      />
    </View>
  );
}
