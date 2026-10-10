import { View, Text, FlatList, ActivityIndicator, Pressable, Alert, Platform, Linking, Share, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { isOneWayOnly } from '@/lib/travel';
import TournamentCard from '@/components/TournamentCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors, CORAL } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { daysUntil, formatDateRange } from '@/lib/dates';
import { showToast } from '@/components/Toast';
import ReferFriend from '@/components/ReferFriend';
import type { Tournament } from '@/types/database';
import { addAllDayEventsToCalendar } from '@/lib/calendar';
import { withAthlete } from '@/lib/calendarFormat';
import LessonCard from '@/components/LessonCard';
import { groupByMonth } from '@/lib/nextUp';
import GameCard from '@/components/GameCard';
import SwipeToDelete from '@/components/SwipeToDelete';
import { fetchUpcomingGames, deleteTeamEvent, type ScheduleGame } from '@/lib/teamEvents';
import { fetchMyUpcomingLessons, isSupabaseConfigured as coachingConfigured, type ParentLesson } from '@/lib/coach';

type ListItem =
  | { type: 'tournament'; data: Tournament }
  | { type: 'lesson'; data: ParentLesson }
  | { type: 'game'; data: ScheduleGame }
  | { type: 'divider'; label: string };

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
  const [games, setGames] = useState<ScheduleGame[]>([]);
  // Swipe left on a game → Delete.
  const removeGame = async (id: string) => {
    const { error } = await deleteTeamEvent(id);
    if (error) { showToast(error.message); return; }
    setGames((gs) => gs.filter((g) => g.id !== id));
    showToast('Game deleted');
  };
  useFocusEffect(useCallback(() => {
    fetchUpcomingGames().then(setGames);
  }, []));

  // Lookup athlete for active season
  const activeAthlete = athletes.find((a) => activeSeason && a.id === activeSeason.athlete_id) ?? null;

  // Filter tournaments to active season
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  // Filter = the header switcher (store): All / an athlete, and All teams / one team.
  const athleteFilter = useSeasonStore((st) => st.scheduleAthlete);
  const teamFilter = useSeasonStore((st) => st.scheduleTeam);
  const chipAthletes = useMemo(() => {
    const list = athletes.map((a) => ({ id: a.id, name: a.first_name }));
    for (const l of lessons) {
      if (l.athlete_id && !list.some((x) => x.id === l.athlete_id)) list.push({ id: l.athlete_id, name: l.athlete_first_name ?? 'Athlete' });
    }
    return list;
  }, [athletes, lessons]);

  const listItems = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seasonIds = teamFilter !== 'all'
      ? new Set([teamFilter])
      : athleteFilter === 'all' ? null : new Set(seasons.filter((x) => x.athlete_id === athleteFilter).map((x) => x.id));
    const tours = seasonIds ? tournaments.filter((t) => seasonIds.has(t.season_id)) : tournaments;
    const gms = seasonIds ? games.filter((g) => seasonIds.has(g.season_id)) : games;

    // Upcoming: tournaments (in progress ones under today) and games, by date, grouped by month. Lessons live on Home.
    const upcoming = [
      ...tours.filter((t) => daysUntil(t.end_date) >= 0).map((t) => ({ date: t.start_date < today ? today : t.start_date, item: { type: 'tournament' as const, data: t } })),
      ...gms.map((g) => ({ date: g.date, item: { type: 'game' as const, data: g } })),
    ].sort((x, y) => x.date.localeCompare(y.date) || (x.item.type === 'tournament' ? -1 : y.item.type === 'tournament' ? 1 : 0));

    const items: ListItem[] = [];
    for (const g of groupByMonth(upcoming)) {
      items.push({ type: 'divider', label: g.label });
      g.items.forEach((x) => items.push(x.item));
    }
    const past = tours.filter((t) => daysUntil(t.end_date) < 0).sort((x, y) => y.start_date.localeCompare(x.start_date));
    if (past.length > 0) {
      items.push({ type: 'divider', label: 'COMPLETED' });
      past.forEach((t) => items.push({ type: 'tournament', data: t }));
    }
    return items;
  }, [tournaments, lessons, games, seasons, athleteFilter, teamFilter]);

  const athleteName = (id: string | null | undefined) => chipAthletes.find((a) => a.id === id)?.name;
  // All Athletes view (more than one athlete): every card says whose it is.
  const nameCards = chipAthletes.length > 1 && athleteFilter === 'all';
  // "All" with more than one athlete: no single team's details in the header.
  const allView = athletes.length > 1 && athleteFilter === 'all';
  const upcomingCount = listItems.filter((i) => i.type !== 'divider' && !(i.type === 'tournament' && daysUntil(i.data.end_date) < 0)).length;
  const athleteForTournament = (t: Tournament) => {
    const season = seasons.find((x) => x.id === t.season_id);
    return athletes.find((a) => a.id === season?.athlete_id) ?? null;
  };

  const teamName = activeSeason?.team_name ?? '';
  const seasonYear = activeSeason?.season_year ?? '';

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'lesson') {
      return <LessonCard lesson={item.data} athleteName={nameCards ? athleteName(item.data.athlete_id) : undefined} />;
    }
    if (item.type === 'game') {
      const season = seasons.find((x) => x.id === item.data.season_id);
      return (
        <SwipeToDelete onDelete={() => removeGame(item.data.id)} accessibilityLabel="Delete game">
          <GameCard game={item.data} athlete={athletes.find((a) => a.id === season?.athlete_id)} athleteName={nameCards ? athleteName(season?.athlete_id) : undefined} teamName={nameCards ? season?.team_name : undefined} />
        </SwipeToDelete>
      );
    }
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
                    flightOneWay={isOneWayOnly(flightBookings.filter((f) => f.tournament_id === item.data.id))}
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
        athlete={athleteForTournament(item.data)}
        showAthleteName={nameCards}
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
        keyExtractor={(item, index) => item.type === 'divider' ? `divider-${index}` : `${item.type}-${item.data.id}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onRefresh={refresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View className="mb-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-lg font-bold text-rally-700 dark:text-rally-300 font-nunito-extrabold" numberOfLines={1}>
                  {allView ? 'All athletes' : teamName}
                </Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  {allView
                    ? `${upcomingCount} upcoming tournament${upcomingCount === 1 ? '' : 's'} and game${upcomingCount === 1 ? '' : 's'} · pick an athlete for team details`
                    : `${seasonYear ? `${seasonYear} · ` : ''}${seasonTournaments.length} tournament${seasonTournaments.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            </View>

            {/* Team details (incl. live stream) */}
            {activeSeason && !allView ? (
              <Pressable
                className="flex-row items-center justify-center rounded-xl py-3 mt-3 border border-rally-600 bg-warm-white dark:bg-bark-light active:opacity-70"
                onPress={() => router.push('/settings/team-details')}
                accessibilityLabel="Team details"
              >
                <Ionicons name="create-outline" size={17} color="#3B82B0" />
                <Text className="text-sm font-bold text-rally-600 ml-1.5">Team details</Text>
              </Pressable>
            ) : null}
            {activeSeason?.default_stream_url && !allView ? (
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
            {teamCode && !allView ? (
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
                    title: withAthlete(athleteName(seasons.find((x) => x.id === t.season_id)?.athlete_id), t.name),
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
