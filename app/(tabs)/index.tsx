import { useState } from 'react';
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

const AVATAR_COLORS = [
  '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
  '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
];

export default function HomeScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const seasons = useSeasonStore((s) => s.seasons);
  const athletes = useSeasonStore((s) => s.athletes);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const teamCode = activeSeason?.team_code;
  const ic = useIconColors();

  // Filter for Next 30 Days section: 'all' or a specific athlete ID
  const [athleteFilter, setAthleteFilter] = useState<string>('all');

  // All tournaments across all seasons (for "all" filter)
  const allNext30 = useMemo(() => {
    return tournaments
      .filter((t) => daysUntil(t.end_date) >= 0 && daysUntil(t.start_date) <= 30)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [tournaments]);

  // Filtered tournaments for selected athlete
  const filteredNext30 = useMemo(() => {
    if (athleteFilter === 'all') return allNext30;
    const athleteSeasonIds = new Set(
      seasons.filter((s) => s.athlete_id === athleteFilter).map((s) => s.id)
    );
    return allNext30.filter((t) => athleteSeasonIds.has(t.season_id));
  }, [allNext30, athleteFilter, seasons]);

  // Active season tournaments (for action items)
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  // Emails needing review (unclassified or action not taken)
  const emailsToReview = useMemo(() =>
    forwardedEmails.filter((e) => e.classification === 'unclassified' || e.action_taken === 'none'),
    [forwardedEmails]
  );

  const actionItems = useMemo(() => {
    const items: { text: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress?: () => void }[] = [];
    const needsBooking = seasonTournaments.filter((t) => t.status === 'travel_needed');
    if (needsBooking.length > 0) {
      items.push({
        text: `${needsBooking.length} tournament${needsBooking.length > 1 ? 's' : ''} still need hotel bookings`,
        icon: 'bed-outline',
        color: '#d97706',
        onPress: () => router.push('/(tabs)/travel'),
      });
    }
    const noTickets = seasonTournaments.filter(
      (t) => !t.tickets_purchased && daysUntil(t.start_date) > 0 && daysUntil(t.start_date) <= 7
    );
    if (noTickets.length > 0) {
      items.push({
        text: `Buy tickets for ${noTickets.map((t) => t.name).join(', ')}`,
        icon: 'ticket-outline',
        color: '#7c3aed',
        onPress: noTickets.length === 1 ? () => router.push(`/tournament/${noTickets[0].id}`) : undefined,
      });
    }
    if (!teamCode) {
      items.push({
        text: 'Set your team ticket code for quick access',
        icon: 'key-outline',
        color: '#3B82B0',
        onPress: () => router.push('/settings/team-details'),
      });
    }
    return items;
  }, [seasonTournaments, teamCode]);

  const forwardAddress = adminConfig?.rally_forward_address || 'plans@rally-hub.com';
  const hasMultipleAthletes = athletes.length > 1;

  // Lookup athlete for a tournament (via season)
  const getAthleteForTournament = (t: typeof tournaments[0]) => {
    const season = seasons.find((s) => s.id === t.season_id);
    return season ? athletes.find((a) => a.id === season.athlete_id) ?? null : null;
  };

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ============================================================ */}
        {/* QUICK ADD — Top of page */}
        {/* ============================================================ */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl py-3 mt-3 flex-row items-center justify-center active:opacity-80 border border-parchment dark:border-rally-900"
          onPress={() => router.push('/settings/schedule-import')}
        >
          <Ionicons name="trophy-outline" size={16} color="#7c3aed" />
          <Text className="text-sm font-semibold text-bark dark:text-cream ml-2">Add Tournament Details</Text>
        </Pressable>
        <View className="flex-row gap-2 mt-2">
          <Pressable
            className="flex-1 bg-rally-600 rounded-xl py-3 flex-row items-center justify-center active:opacity-80"
            style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}
            onPress={() => router.push('/import/paste-combined')}
          >
            <Ionicons name="sparkles" size={16} color="#FEFEFE" />
            <Text className="text-sm font-semibold text-cream ml-2">Paste + AI</Text>
          </Pressable>
          <Pressable
            className="flex-1 bg-warm-white dark:bg-bark-light rounded-xl py-3 flex-row items-center justify-center active:opacity-80 border border-parchment dark:border-rally-900"
            onPress={() => router.push('/settings/email-forward')}
          >
            <Ionicons name="mail-open" size={16} color="#3B82B0" />
            <Text className="text-sm font-semibold text-bark dark:text-cream ml-2">Forward Email</Text>
          </Pressable>
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-xl py-3 px-4 items-center justify-center active:opacity-80 border border-parchment dark:border-rally-900"
            onPress={() => router.push('/booking/add-hotel')}
          >
            <Ionicons name="add" size={20} color="#3B82B0" />
          </Pressable>
        </View>

        {/* ============================================================ */}
        {/* 1. ACTION ITEMS */}
        {/* ============================================================ */}
        {actionItems.length > 0 && (
          <View className="mt-5">
            <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-2 ml-1">
              Action Items
            </Text>
            {actionItems.map((item, i) => (
              <Pressable
                key={i}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
                onPress={item.onPress}
                disabled={!item.onPress}
              >
                <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: item.color + '15' }}>
                  <Ionicons name={item.icon} size={16} color={item.color} />
                </View>
                <Text className="text-sm text-bark dark:text-parchment flex-1">
                  {item.text}
                </Text>
                {item.onPress && <Ionicons name="chevron-forward" size={14} color="#8FA8BF" />}
              </Pressable>
            ))}
          </View>
        )}

        {/* ============================================================ */}
        {/* 2. EMAILS TO REVIEW */}
        {/* ============================================================ */}
        {emailsToReview.length > 0 && (
          <Pressable
            className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mt-4 border border-amber-200 dark:border-amber-800 flex-row items-center active:opacity-80"
            onPress={() => router.push('/email/inbox')}
          >
            <View className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 items-center justify-center mr-3">
              <Ionicons name="mail-unread" size={20} color="#d97706" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">
                {emailsToReview.length} email{emailsToReview.length !== 1 ? 's' : ''} to review
              </Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                Tap to review and map to tournaments
              </Text>
            </View>
            <View className="bg-amber-500 w-6 h-6 rounded-full items-center justify-center">
              <Text className="text-xs font-bold text-white">{emailsToReview.length}</Text>
            </View>
          </Pressable>
        )}

        {/* All emails link (when there are emails but none to review) */}
        {emailsToReview.length === 0 && forwardedEmails.length > 0 && (
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mt-4 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
            onPress={() => router.push('/email/inbox')}
          >
            <Ionicons name="mail" size={16} color="#3B82B0" />
            <Text className="text-xs font-medium text-stone dark:text-parchment ml-2 flex-1">
              {forwardedEmails.length} email{forwardedEmails.length !== 1 ? 's' : ''} synced
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#8FA8BF" />
          </Pressable>
        )}

        {/* ============================================================ */}
        {/* 3. NEXT 30 DAYS */}
        {/* ============================================================ */}
        <View className="mt-5">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-stone uppercase tracking-wider ml-1">
              Next 30 Days
            </Text>
          </View>

          {/* Athlete filter chips — only show if multiple athletes */}
          {hasMultipleAthletes && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
              <Pressable
                className={`px-3 py-1.5 rounded-full border ${
                  athleteFilter === 'all'
                    ? 'bg-rally-600 border-rally-600'
                    : 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'
                }`}
                onPress={() => setAthleteFilter('all')}
              >
                <Text className={`text-xs font-semibold ${
                  athleteFilter === 'all' ? 'text-cream' : 'text-bark dark:text-parchment'
                }`}>
                  All Athletes
                </Text>
              </Pressable>
              {athletes.map((a) => {
                const avatarColor = a.avatar_color || AVATAR_COLORS[a.first_name.charCodeAt(0) % AVATAR_COLORS.length];
                const isSelected = athleteFilter === a.id;
                return (
                  <Pressable
                    key={a.id}
                    style={isSelected ? { backgroundColor: avatarColor, borderColor: avatarColor, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999 } : undefined}
                    className={isSelected ? undefined : 'px-3 py-1.5 rounded-full border bg-warm-white border-parchment'}
                    onPress={() => setAthleteFilter(a.id)}
                  >
                    <Text className={`text-xs font-semibold ${isSelected ? 'text-cream' : 'text-bark'}`}>
                      {a.first_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {filteredNext30.length > 0 ? (
            filteredNext30.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                hotelCount={hotelBookings.filter((h) => h.tournament_id === t.id).length}
                flightCount={flightBookings.filter((f) => f.tournament_id === t.id).length}
                backupHotelCount={hotelBookings.filter((h) => h.tournament_id === t.id && h.is_backup).length}
                athlete={getAthleteForTournament(t)}
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

        {/* ============================================================ */}
        {/* 4. FORWARD EMAIL REMINDER */}
        {/* ============================================================ */}
        <Pressable
          className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mt-5 border border-rally-200 dark:border-rally-800 active:opacity-80"
          onPress={async () => {
            if (Platform.OS === 'web') {
              await navigator.clipboard.writeText(forwardAddress);
            } else {
              await Clipboard.setStringAsync(forwardAddress);
            }
            tapLight();
            if (Platform.OS !== 'web') {
              Alert.alert('Copied', 'Forward address copied to clipboard.');
            }
          }}
        >
          <View className="flex-row items-center">
            <Ionicons name="mail-open-outline" size={18} color="#3B82B0" />
            <Text className="text-xs font-semibold text-rally-700 dark:text-rally-300 ml-2 uppercase tracking-wider">
              Forward emails to RALLY
            </Text>
          </View>
          <Text selectable className="text-lg font-bold text-rally-600 dark:text-rally-400 mt-2">
            {forwardAddress}
          </Text>
          <Text className="text-xs text-stone dark:text-parchment mt-1">
            Tap to copy — forward hotel, flight, and tournament emails and we'll do the rest.
          </Text>
        </Pressable>

        <View className="h-4" />
      </ScrollView>
    </View>
  );
}
