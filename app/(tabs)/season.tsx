import { View, Text, FlatList, ActivityIndicator, Pressable, Alert, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import TournamentCard from '@/components/TournamentCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { daysUntil } from '@/lib/dates';
import ReferFriend from '@/components/ReferFriend';
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

  const athletes = useSeasonStore((s) => s.athletes);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const teamCode = activeSeason?.team_code;

  // Lookup athlete for active season
  const activeAthlete = athletes.find((a) => activeSeason && a.id === activeSeason.athlete_id) ?? null;

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
        athlete={activeAthlete}
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
              <View className="flex-1 mr-3">
                <Text className="text-lg font-bold text-rally-700 dark:text-rally-300 font-nunito-extrabold" numberOfLines={1}>
                  {teamName}
                </Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  {seasonYear ? `${seasonYear} · ` : ''}{seasonTournaments.length} tournament{seasonTournaments.length !== 1 ? 's' : ''}
                </Text>
              </View>
              {activeSeason?.default_stream_url ? (
                <Pressable
                  className="flex-row items-center bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg active:opacity-70"
                  onPress={() => Linking.openURL(activeSeason.default_stream_url!)}
                >
                  <Ionicons name="tv-outline" size={14} color="#dc2626" />
                  <Text className="text-xs font-semibold text-red-600 ml-1">Watch Live</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Team Code Block */}
            {teamCode ? (
              <Pressable
                className="bg-rally-600 rounded-xl p-4 mt-3 flex-row items-center active:opacity-90"
                style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}
                onPress={async () => {
                  if (Platform.OS === 'web') {
                    await navigator.clipboard.writeText(teamCode);
                  } else {
                    await Clipboard.setStringAsync(teamCode);
                  }
                  tapLight();
                  if (Platform.OS !== 'web') {
                    Alert.alert('Copied', 'Team code copied to clipboard.');
                  }
                }}
              >
                <View className="flex-1">
                  <Text className="text-xs text-rally-200 uppercase tracking-wider">Team Code</Text>
                  <Text className="text-2xl font-bold text-cream tracking-widest mt-0.5">{teamCode}</Text>
                </View>
                <Ionicons name="copy-outline" size={20} color="rgba(254,254,254,0.7)" />
              </Pressable>
            ) : null}

            {/* Add All to Calendar */}
            {seasonTournaments.length > 0 && (
              <Pressable
                className="bg-warm-white border border-parchment rounded-xl p-3 mt-3 flex-row items-center justify-center active:opacity-80"
                style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}
                onPress={() => {
                  const upcoming = seasonTournaments
                    .filter((t) => daysUntil(t.end_date) >= 0)
                    .sort((a, b) => a.start_date.localeCompare(b.start_date));
                  const tourns = upcoming.length > 0 ? upcoming : seasonTournaments;

                  if (Platform.OS === 'web') {
                    // Open Google Calendar for first tournament, copy .ics for all
                    const icsEvents = tourns.map((t) => {
                      const start = t.start_date.replace(/-/g, '') + 'T080000';
                      const end = t.end_date.replace(/-/g, '') + 'T200000';
                      return `BEGIN:VEVENT\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${t.name}\r\nLOCATION:${t.location_city || ''}\r\nEND:VEVENT`;
                    }).join('\r\n');
                    const icsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RALLY//Season//EN\r\n${icsEvents}\r\nEND:VCALENDAR`;
                    const blob = new Blob([icsContent], { type: 'text/calendar' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${teamName || 'rally'}-${seasonYear || 'season'}.ics`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } else {
                    const icsEvents = tourns.map((t) => {
                      const start = t.start_date.replace(/-/g, '') + 'T080000';
                      const end = t.end_date.replace(/-/g, '') + 'T200000';
                      return `BEGIN:VEVENT\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${t.name}\r\nLOCATION:${t.location_city || ''}\r\nEND:VEVENT`;
                    }).join('\r\n');
                    const icsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RALLY//Season//EN\r\n${icsEvents}\r\nEND:VCALENDAR`;
                    Linking.openURL(`data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`);
                  }
                  tapLight();
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#3B82B0" />
                <Text className="text-sm font-semibold text-rally-600 ml-2">Add All to Calendar</Text>
              </Pressable>
            )}
          </View>
        }
        ListFooterComponent={
          <>
          {activeSeason ? (
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
                title="Add Tournaments & Travel"
                subtitle="Paste schedules, hotel/flight confirmations, or auto-import"
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
          ) : null}
          <ReferFriend />
          </>
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
