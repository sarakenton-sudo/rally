import { View, Text, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import TournamentCard from '@/components/TournamentCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

export default function HomeScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const teamCode = activeSeason?.team_code;

  // Filter tournaments to active season
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  const next30Days = useMemo(() => {
    return seasonTournaments
      .filter((t) => daysUntil(t.end_date) >= 0 && daysUntil(t.start_date) <= 30)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [seasonTournaments]);

  const actionItems = useMemo(() => {
    const items: string[] = [];
    const needsBooking = seasonTournaments.filter((t) => t.status === 'travel_needed');
    if (needsBooking.length > 0) {
      items.push(`${needsBooking.length} tournament${needsBooking.length > 1 ? 's' : ''} still need hotel bookings`);
    }
    const noTickets = seasonTournaments.filter(
      (t) => !t.tickets_purchased && daysUntil(t.start_date) > 0 && daysUntil(t.start_date) <= 7
    );
    if (noTickets.length > 0) {
      items.push(`Buy tickets for ${noTickets.map((t) => t.name).join(', ')}`);
    }
    if (!teamCode) {
      items.push('Set your team ticket code for quick access');
    }
    return items;
  }, [seasonTournaments, teamCode]);

  const ic = useIconColors();
  const teamName = activeSeason?.team_name ?? 'RallyHUB';
  const seasonYear = activeSeason?.season_year ?? '';

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView className="flex-1 px-4">
        <Text className="text-sm text-stone dark:text-parchment mt-3 mb-1">
          {teamName}{seasonYear ? ` — ${seasonYear}` : ''}
        </Text>

        {/* Team Code Vault — only show if a code is set */}
        {teamCode ? (
          <Pressable
            className="bg-rally-600 rounded-2xl p-5 mt-5 active:opacity-90"
            style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 }}
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
            <Text className="text-xs font-medium text-rally-200 uppercase tracking-wider">
              Team Code
            </Text>
            <Text className="text-4xl font-bold text-cream mt-1 tracking-widest">
              {teamCode}
            </Text>
            <Text className="text-xs text-rally-200 mt-2">
              Tap to copy
            </Text>
          </Pressable>
        ) : null}

        {/* Email Activity */}
        {forwardedEmails.length > 0 && (
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-4 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
            style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
            onPress={() => router.push('/email/inbox')}
          >
            <View className="w-10 h-10 rounded-full bg-rally-50 dark:bg-rally-900/30 items-center justify-center mr-3">
              <Ionicons name="mail" size={20} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">
                Email Inbox
              </Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                {forwardedEmails.length} email{forwardedEmails.length !== 1 ? 's' : ''} synced from Gmail
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
          </Pressable>
        )}

        {/* Schedule Import */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-4 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
          style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
          onPress={() => router.push('/settings/schedule-import')}
        >
          <View className="w-10 h-10 rounded-full bg-rally-50 dark:bg-rally-900/30 items-center justify-center mr-3">
            <Ionicons name="add-circle-outline" size={20} color="#3B82B0" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">
              Add Tournaments & Travel
            </Text>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">
              Paste schedules, import confirmations, or connect Gmail
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
        </Pressable>

        {/* Next 30 Days */}
        <View className="mt-5">
          <Text className="text-xs font-semibold text-stone dark:text-stone uppercase tracking-wider mb-2">
            Next 30 Days
          </Text>
          {next30Days.length > 0 ? (
            next30Days.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                hotelCount={hotelBookings.filter((h) => h.tournament_id === t.id).length}
                flightCount={flightBookings.filter((f) => f.tournament_id === t.id).length}
                backupHotelCount={hotelBookings.filter((h) => h.tournament_id === t.id && h.is_backup).length}
                onPress={() => router.push(`/tournament/${t.id}`)}
              />
            ))
          ) : (
            <View
              className="bg-warm-white dark:bg-bark-light rounded-2xl p-5 border border-parchment dark:border-rally-900"
              style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
            >
              <Text className="text-base text-stone dark:text-parchment">
                No upcoming tournaments in the next 30 days
              </Text>
            </View>
          )}
        </View>

        {/* Action Items */}
        <View className="mt-5 mb-8">
          <Text className="text-xs font-semibold text-stone dark:text-stone uppercase tracking-wider mb-2">
            Action Items
          </Text>
          {actionItems.length > 0 ? (
            actionItems.map((item, i) => (
              <View
                key={i}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 flex-row items-center border border-parchment dark:border-rally-900"
              >
                <View className="w-2 h-2 rounded-full bg-gold mr-3" />
                <Text className="text-sm text-bark dark:text-parchment flex-1">
                  {item}
                </Text>
              </View>
            ))
          ) : (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4">
              <Text className="text-sm text-stone dark:text-stone">
                All caught up — no action items right now
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
