import { View, Text, FlatList, ActivityIndicator, Pressable, Alert, Platform, Linking, Share } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import TournamentCard from '@/components/TournamentCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { daysUntil, formatDateRange } from '@/lib/dates';
import { showToast } from '@/components/Toast';
import ReferFriend from '@/components/ReferFriend';
import type { Tournament } from '@/types/database';
import { addAllDayEventsToCalendar } from '@/lib/calendar';
import LessonCard from '@/components/LessonCard';
import { fetchMyUpcomingLessons, isSupabaseConfigured as coachingConfigured, type ParentLesson } from '@/lib/coach';

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

  const [lessons, setLessons] = useState<ParentLesson[]>([]);
  useFocusEffect(useCallback(() => {
    if (coachingConfigured) fetchMyUpcomingLessons(60).then(({ data }) => setLessons(data));
  }, []));

  // Lookup athlete for active season
  const activeAthlete = athletes.find((a) => activeSeason && a.id === activeSeason.athlete_id) ?? null;

  // Filter tournaments to active season
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  // Share: team, season, code and the upcoming tournaments — for co-parents, grandparents, carpools.
  const shareTeam = async () => {
    if (!activeSeason) return;
    tapLight();
    const upcoming = seasonTournaments
      .filter((t) => daysUntil(t.end_date) >= 0)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const lines = [
      `${activeSeason.team_name}${activeAthlete ? ` (${activeAthlete.first_name})` : ''} · ${activeSeason.season_year}`,
      activeSeason.club_name ? activeSeason.club_name : null,
      activeSeason.team_code ? `Team code: ${activeSeason.team_code}` : null,
      activeSeason.default_stream_url ? `Watch live: ${activeSeason.default_stream_url}` : null,
      upcoming.length ? '' : null,
      upcoming.length ? 'Upcoming tournaments:' : null,
      ...upcoming.map((t) => {
        const venue = t.venues?.find((v) => v.is_confirmed) ?? t.venues?.[0];
        const where = [venue?.label, venue?.address || t.location_city].filter(Boolean).join(', ');
        const stream = t.streaming_links?.[0]?.url;
        return `• ${t.name} — ${formatDateRange(t.start_date, t.end_date)}${where ? ` · ${where}` : ''}${stream ? `\n  Watch: ${stream}` : ''}`;
      }),
      '',
      'Shared from RallyHUB · rally-hub.com',
    ].filter((l) => l !== null) as string[];
    const message = lines.join('\n');
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      showToast('Team details copied');
    } else {
      await Share.share({ message });
    }
  };

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
        hasFlightConflict={(() => {
          const tf = flightBookings.filter((f) => f.tournament_id === item.data.id);
          const seen = new Set<string>();
          for (const f of tf) {
            for (const name of f.traveler_names) {
              const key = `${name.toLowerCase().trim()}|${f.departure_date}`;
              if (seen.has(key)) return true;
              seen.add(key);
            }
          }
          return false;
        })()}
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
            </View>

            {/* Team actions — prominent: details (incl. live stream) and share */}
            {activeSeason ? (
              <View className="flex-row mt-3" style={{ gap: 8 }}>
                <Pressable
                  className="flex-1 flex-row items-center justify-center rounded-xl py-3 border border-rally-600 bg-warm-white dark:bg-bark-light active:opacity-70"
                  onPress={() => router.push('/settings/team-details')}
                  accessibilityLabel="Team details"
                >
                  <Ionicons name="create-outline" size={17} color="#3B82B0" />
                  <Text className="text-sm font-bold text-rally-600 ml-1.5">Team details</Text>
                </Pressable>
                <Pressable
                  className="flex-1 flex-row items-center justify-center rounded-xl py-3 bg-rally-600 active:opacity-80"
                  onPress={shareTeam}
                  accessibilityLabel="Share team details"
                >
                  <Ionicons name="share-outline" size={17} color="#FEFEFE" />
                  <Text className="text-sm font-bold text-cream ml-1.5">Share team</Text>
                </Pressable>
              </View>
            ) : null}
            {activeSeason?.default_stream_url ? (
              <Pressable
                className="flex-row items-center justify-center rounded-xl py-2.5 mt-2 bg-red-50 dark:bg-red-900/20 active:opacity-70"
                onPress={() => Linking.openURL(activeSeason.default_stream_url!)}
                accessibilityLabel="Watch live"
              >
                <Ionicons name="tv-outline" size={16} color="#dc2626" />
                <Text className="text-sm font-bold text-red-600 ml-1.5">
                  Watch Live{activeSeason.default_streaming_platform ? ` · ${activeSeason.default_streaming_platform}` : ''}
                </Text>
              </Pressable>
            ) : null}

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

                  addAllDayEventsToCalendar(tourns.map((t) => ({
                    title: t.name,
                    startDate: t.start_date,
                    endDate: t.end_date,
                    location: t.location_city,
                  })));
                  tapLight();
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#3B82B0" />
                <Text className="text-sm font-semibold text-rally-600 ml-2">Add All to Calendar</Text>
              </Pressable>
            )}

            {/* Lessons (next 60 days) — lessons are events on the schedule too */}
            <View className="mt-5">
              <View className="flex-row items-center mb-2">
                <Text className="text-xs font-semibold text-stone uppercase tracking-wider flex-1">Lessons</Text>
                <Pressable onPress={() => { tapLight(); router.push('/lessons'); }} className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-80" style={{ backgroundColor: '#3B82B0' }} accessibilityLabel="Book a lesson">
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text className="text-xs font-bold text-white ml-0.5">Book a lesson</Text>
                </Pressable>
              </View>
              {lessons.length ? lessons.map((l) => (
                <LessonCard key={l.id} lesson={l} athleteName={athletes.length > 1 ? athletes.find((a) => a.id === l.athlete_id)?.first_name : undefined} />
              )) : (
                <Text className="text-xs text-stone dark:text-parchment mb-1">No lessons booked in the next 60 days.</Text>
              )}
            </View>

            <Text className="text-xs font-semibold text-stone uppercase tracking-wider mt-5">Tournaments</Text>
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
                title="Team details & live stream"
                subtitle={[activeSeason.club_name, activeSeason.season_year, activeSeason.default_streaming_platform ? `Stream: ${activeSeason.default_streaming_platform}` : 'No stream set'].filter(Boolean).join(' · ')}
                onPress={() => router.push('/settings/team-details')}
              />

              <HubSettingsRow
                icon="calendar"
                iconColor="#6A9E8A"
                title="Add Tournaments & Travel"
                subtitle="Paste schedules, hotel/flight confirmations, or auto-import"
                onPress={() => router.push('/settings/schedule-import')}
              />

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
