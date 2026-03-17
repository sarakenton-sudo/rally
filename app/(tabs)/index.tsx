import { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Platform, ActionSheetIOS, Modal, Linking, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import TournamentCard from '@/components/TournamentCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import ReferFriend from '@/components/ReferFriend';

const AVATAR_COLORS = [
  '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
  '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
];

function SectionHeader({ icon, iconColor, title, subtitle, right }: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start mb-3">
      <View className="w-1 self-stretch rounded-full mr-3 mt-0.5" style={{ backgroundColor: iconColor }} />
      <View className="flex-row items-center mr-2 mt-0.5">
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-bark dark:text-cream">{title}</Text>
        {subtitle && (
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

export default function HomeScreen() {
  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const seasons = useSeasonStore((s) => s.seasons);
  const athletes = useSeasonStore((s) => s.athletes);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const guests = useGuestStore((s) => s.guests);
  const ic = useIconColors();
  const { user } = useAuth();
  const { refresh, isRefreshing } = useDataRefresh();

  // Refresh data when Home tab gains focus (keeps co-admins in sync)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [athleteFilter, setAthleteFilter] = useState<string>('all');
  const [featureRequest, setFeatureRequest] = useState('');
  const [featureSubmitted, setFeatureSubmitted] = useState(false);

  const externalLinks = adminConfig?.external_links ?? [];
  const credentialLinks = externalLinks.filter((l) => l.scope !== 'athlete' && (l.username || l.password || l.url));

  const handlePlusPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Tournament', 'Hotel', 'Flight', 'Team Event'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) router.push('/tournament/add');
          else if (index === 2) router.push('/booking/add-hotel');
          else if (index === 3) router.push('/booking/add-flight');
          else if (index === 4) router.push('/booking/add-team-event');
        }
      );
    } else {
      setShowAddMenu(true);
    }
  };

  // Active season tournaments (for action items)
  const seasonTournaments = useMemo(() =>
    activeSeasonId ? tournaments.filter((t) => t.season_id === activeSeasonId) : tournaments,
    [tournaments, activeSeasonId]
  );

  // Emails needing review — unclassified emails, or classified ones that haven't been acted on yet
  const emailsToReview = useMemo(() =>
    forwardedEmails.filter((e) =>
      e.classification === 'unclassified' ||
      (e.classification !== 'other' && e.action_taken === 'none')
    ),
    [forwardedEmails]
  );

  // ─── SECTION 2: Actions ───
  const actionCards = useMemo(() => {
    const cards: { priority: number; text: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; color: string; bgColor: string; onPress: () => void }[] = [];

    // Priority 1: Emails to review
    if (emailsToReview.length > 0) {
      cards.push({
        priority: 1,
        text: `${emailsToReview.length} Email${emailsToReview.length !== 1 ? 's' : ''} to Review & Import`,
        subtitle: 'Tap to review and map to tournaments',
        icon: 'mail-unread',
        color: '#d97706',
        bgColor: '#FEF3C7',
        onPress: () => router.push('/email/inbox'),
      });
    }

    // Priority 2: Share tourney details (within 3 days)
    const shareSoon = seasonTournaments.filter((t) => {
      const d = daysUntil(t.start_date);
      return d >= 0 && d <= 3;
    });
    for (const t of shareSoon) {
      cards.push({
        priority: 2,
        text: `Share Tourney Details with Guests`,
        subtitle: t.name,
        icon: 'share-social',
        color: '#3B82B0',
        bgColor: '#DBEAFE',
        onPress: () => router.push(`/tournament/${t.id}`),
      });
    }

    // Priority 3: Buy tickets (within 7 days or past ticket date)
    const buyTickets = seasonTournaments.filter((t) => {
      if (t.tickets_purchased) return false;
      if (!t.ticket_link) return false;
      const d = daysUntil(t.start_date);
      if (d >= 0 && d <= 7) return true;
      if (t.ticket_sales_date) {
        const salesD = daysUntil(t.ticket_sales_date);
        return salesD <= 0;
      }
      return false;
    });
    for (const t of buyTickets) {
      const activeSeason = seasons.find((s) => s.id === activeSeasonId);
      const teamCode = activeSeason?.team_code;
      cards.push({
        priority: 3,
        text: `Buy Tickets for ${t.name}`,
        subtitle: teamCode ? `Code copied: ${teamCode}` : 'Tickets available now',
        icon: 'ticket-outline',
        color: '#7c3aed',
        bgColor: '#EDE9FE',
        onPress: async () => {
          if (teamCode) {
            if (Platform.OS === 'web') {
              navigator.clipboard.writeText(teamCode);
            } else {
              await Clipboard.setStringAsync(teamCode);
            }
          }
          if (t.ticket_link) {
            if (Platform.OS === 'web') {
              window.open(t.ticket_link, '_blank');
            } else {
              Linking.openURL(t.ticket_link);
            }
          }
        },
      });
    }

    // Priority 4: Book air (within 90 days, no flight, not marked unnecessary)
    const needAir = seasonTournaments.filter((t) => {
      if (t.air_not_needed) return false;
      const d = daysUntil(t.start_date);
      if (d < 0 || d > 90) return false;
      return !flightBookings.some((f) => f.tournament_id === t.id);
    });
    for (const t of needAir) {
      cards.push({
        priority: 4,
        text: `Book Air for ${t.name}`,
        subtitle: `${daysUntil(t.start_date)} days away`,
        icon: 'airplane-outline',
        color: '#6A9E8A',
        bgColor: '#E8F5EE',
        onPress: () => router.push('/booking/add-flight'),
      });
    }

    // Priority 5: Book hotel (within 45 days, no hotel, not marked unnecessary)
    const needHotel = seasonTournaments.filter((t) => {
      if (t.hotel_not_needed) return false;
      const d = daysUntil(t.start_date);
      if (d < 0 || d > 45) return false;
      return !hotelBookings.some((h) => h.tournament_id === t.id && !h.is_backup);
    });
    for (const t of needHotel) {
      cards.push({
        priority: 5,
        text: `Book Hotel for ${t.name}`,
        subtitle: `${daysUntil(t.start_date)} days away`,
        icon: 'bed-outline',
        color: '#d97706',
        bgColor: '#FEF3C7',
        onPress: () => router.push('/booking/add-hotel'),
      });
    }

    // Priority 3: Multiple hotels booked for a tournament (at least one backup) —
    // alert when the earliest cancellation deadline is within 30 days
    const tournamentHotelMap = new Map<string, typeof hotelBookings>();
    for (const h of hotelBookings) {
      if (!h.tournament_id) continue;
      const list = tournamentHotelMap.get(h.tournament_id) ?? [];
      list.push(h);
      tournamentHotelMap.set(h.tournament_id, list);
    }
    for (const [tid, hotels] of tournamentHotelMap) {
      if (hotels.length < 2) continue;
      if (!hotels.some((h) => h.is_backup)) continue;
      // Find earliest cancellation deadline across ALL hotels for this tournament
      const deadlines = hotels
        .filter((h) => h.cancellation_deadline && daysUntil(h.cancellation_deadline) >= 0)
        .sort((a, b) => a.cancellation_deadline!.localeCompare(b.cancellation_deadline!));
      if (deadlines.length === 0) continue;
      const earliest = deadlines[0];
      const d = daysUntil(earliest.cancellation_deadline!);
      if (d > 30) continue;
      const t = seasonTournaments.find((t) => t.id === tid);
      cards.push({
        priority: 3,
        text: `Pick your hotel for ${t?.name ?? 'tournament'}`,
        subtitle: `${hotels.length} hotels booked — first cancellation deadline ${d === 0 ? 'today' : `in ${d} day${d !== 1 ? 's' : ''}`}`,
        icon: 'alert-circle',
        color: '#dc2626',
        bgColor: '#FEE2E2',
        onPress: t ? () => router.push(`/tournament/${t.id}`) : () => {},
      });
    }

    // Priority 7: Inbox up to date (only if NO other cards)
    if (cards.length === 0) {
      cards.push({
        priority: 6,
        text: 'Inbox Up to Date',
        subtitle: 'Nothing to do right now — nice!',
        icon: 'checkmark-circle',
        color: '#6A9E8A',
        bgColor: '#DCFCE7',
        onPress: () => {},
      });
    }

    return cards.sort((a, b) => a.priority - b.priority);
  }, [emailsToReview, seasonTournaments, hotelBookings, flightBookings]);

  // ─── SECTION 3: Next 30 Days ───
  const hasMultipleAthletes = athletes.length > 1;

  const allNext30 = useMemo(() => {
    return tournaments
      .filter((t) => daysUntil(t.end_date) >= 0 && daysUntil(t.start_date) <= 30)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [tournaments]);

  const filteredNext30 = useMemo(() => {
    if (athleteFilter === 'all') return allNext30;
    const athleteSeasonIds = new Set(
      seasons.filter((s) => s.athlete_id === athleteFilter).map((s) => s.id)
    );
    return allNext30.filter((t) => athleteSeasonIds.has(t.season_id));
  }, [allNext30, athleteFilter, seasons]);

  const getAthleteForTournament = (t: typeof tournaments[0]) => {
    const season = seasons.find((s) => s.id === t.season_id);
    return season ? athletes.find((a) => a.id === season.athlete_id) ?? null : null;
  };

  const handleFeatureSubmit = async () => {
    if (!featureRequest.trim()) return;
    try {
      await (supabase.from('feature_events') as any).insert({
        user_id: user?.id,
        event_type: 'feature_request',
        metadata: { message: featureRequest.trim() },
      });
      tapLight();
      setFeatureRequest('');
      setFeatureSubmitted(true);
      setTimeout(() => setFeatureSubmitted(false), 3000);
    } catch {
      Alert.alert('Error', 'Could not submit. Please try again.');
    }
  };

  return (
    <View className="flex-1 bg-warm-white dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >

        {/* ============================================================ */}
        {/* SECTION 1: Add to Tourney Itineraries                       */}
        {/* ============================================================ */}
        <View className="bg-warm-white dark:bg-bark px-4 pt-4 pb-5">
          <SectionHeader
            icon="add-circle"
            iconColor="#3B82B0"
            title="Add to Tourney Itineraries"
            subtitle="Tournaments, travel, hotels, events — if it's part of your weekend, add it here."
          />
          <View className="flex-row gap-2">
            <Pressable
              className="flex-1 bg-rally-600 rounded-xl py-3.5 items-center justify-center active:opacity-80"
              style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}
              onPress={() => router.push('/import/paste-combined')}
            >
              <Ionicons name="sparkles" size={20} color="#FEFEFE" />
              <Text className="text-xs font-semibold text-cream mt-1">Paste</Text>
            </Pressable>
            <Pressable
              className="flex-1 bg-warm-white dark:bg-bark-light rounded-xl py-3.5 items-center justify-center active:opacity-80 border border-parchment dark:border-rally-900"
              onPress={() => router.push('/settings/email-forward')}
            >
              <Ionicons name="mail-open" size={20} color="#3B82B0" />
              <Text className="text-xs font-semibold text-bark dark:text-cream mt-1">Forward</Text>
            </Pressable>
            <Pressable
              className="flex-1 bg-warm-white dark:bg-bark-light rounded-xl py-3.5 items-center justify-center active:opacity-80 border border-parchment dark:border-rally-900"
              onPress={handlePlusPress}
            >
              <Ionicons name="create-outline" size={20} color="#6A9E8A" />
              <Text className="text-xs font-semibold text-bark dark:text-cream mt-1">Add Manually</Text>
            </Pressable>
          </View>
        </View>

        {/* ============================================================ */}
        {/* SECTION 2: Actions                                           */}
        {/* ============================================================ */}
        <View className="bg-cream dark:bg-bark-light px-4 py-5">
          <SectionHeader
            icon="flash"
            iconColor="#d97706"
            title="Actions"
            subtitle="Your to-do list, built for you."
          />
          {actionCards.map((card, i) => (
            <Pressable
              key={`${card.priority}-${card.text}-${i}`}
              className="rounded-xl p-4 mb-2 flex-row items-center active:opacity-80"
              style={{ backgroundColor: card.bgColor }}
              onPress={card.onPress}
              disabled={card.priority === 6}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: card.color + '20' }}
              >
                <Ionicons name={card.icon} size={20} color={card.color} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-bark">{card.text}</Text>
                <Text className="text-xs text-stone mt-0.5">{card.subtitle}</Text>
              </View>
              {card.priority < 6 && (
                <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
              )}
            </Pressable>
          ))}
        </View>

        {/* ============================================================ */}
        {/* SECTION 3: Next 30 Days                                      */}
        {/* ============================================================ */}
        <View className="bg-warm-white dark:bg-bark px-4 py-5">
          <SectionHeader
            icon="calendar"
            iconColor="#7c3aed"
            title="Next 30 Days"
            subtitle="Everything coming up, all in one place."
            right={hasMultipleAthletes ? (
              <Ionicons name="filter" size={16} color={ic.muted} style={{ marginTop: 4 }} />
            ) : undefined}
          />

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
              <View className="items-center py-4">
                <Ionicons name="calendar-outline" size={32} color={ic.placeholder} />
                <Text className="text-sm text-stone dark:text-parchment mt-2">
                  No upcoming tournaments in the next 30 days
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ============================================================ */}
        {/* SECTION 4: Athletes                                          */}
        {/* ============================================================ */}
        {athletes.length > 0 && (
            <View className="bg-cream dark:bg-bark-light px-4 py-5">
              <SectionHeader
                icon="people-circle"
                iconColor="#0d9488"
                title="Athletes"
                subtitle="Everyone on your roster, right at your fingertips."
              />
              {athletes.map((a) => {
                const avatarColor = a.avatar_color || AVATAR_COLORS[a.first_name.charCodeAt(0) % AVATAR_COLORS.length];
                const athleteSeasons = seasons.filter((s) => s.athlete_id === a.id);
                const tournamentCount = tournaments.filter((t) => athleteSeasons.some((s) => s.id === t.season_id)).length;
                return (
                  <Pressable
                    key={a.id}
                    className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
                    onPress={() => router.push(`/athlete/${a.id}`)}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: avatarColor }}
                    >
                      <Text className="text-base font-bold text-cream">
                        {a.first_name.charAt(0)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-bark dark:text-cream">
                        {a.first_name} {a.last_name || ''}
                      </Text>
                      <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                        {tournamentCount} tournament{tournamentCount !== 1 ? 's' : ''} this season
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                  </Pressable>
                );
              })}
            </View>
        )}

        {/* ============================================================ */}
        {/* SECTION 5: Guests                                            */}
        {/* ============================================================ */}
        <View className="bg-warm-white dark:bg-bark px-4 py-5">
          <SectionHeader
            icon="people"
            iconColor="#7c3aed"
            title="Guests"
          />
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-xl p-4 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
            onPress={() => router.push('/(tabs)/guests')}
          >
            <View className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 items-center justify-center mr-3">
              <Ionicons name="people" size={20} color="#7c3aed" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Manage Guests</Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                {guests.length > 0
                  ? `${guests.length} guest${guests.length !== 1 ? 's' : ''} on your list`
                  : 'Add grandparents, family & friends'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
          </Pressable>
        </View>

        {/* ============================================================ */}
        {/* SECTION 6: Credential Vault                                  */}
        {/* ============================================================ */}
        <View className="bg-cream dark:bg-bark-light px-4 py-5">
          <SectionHeader
            icon="key"
            iconColor="#ca8a04"
            title="Credential Vault"
            subtitle="All your logins, one tap away."
            right={
              <Pressable onPress={() => router.push('/profile/edit-link')} className="active:opacity-70 mt-0.5">
                <Text className="text-xs font-semibold text-rally-600">+ Add</Text>
              </Pressable>
            }
          />

          {credentialLinks.length > 0 ? (
            <View className="flex-row flex-wrap gap-3">
              {credentialLinks.map((link, i) => {
                const hasCredentials = !!(link.username || link.password);
                return (
                  <Pressable
                    key={`${link.label}-${i}`}
                    className="bg-warm-white dark:bg-bark-light rounded-xl p-3 items-center border border-parchment dark:border-rally-900 active:opacity-80"
                    style={{ width: 100 }}
                    onPress={() => {
                      if (link.url) Linking.openURL(link.url);
                      else router.push({ pathname: '/profile/edit-link', params: { index: String(externalLinks.indexOf(link)) } });
                    }}
                  >
                    <View className="relative">
                      <Ionicons name={(link.icon_name as keyof typeof Ionicons.glyphMap) || 'link'} size={24} color="#3B82B0" />
                      {hasCredentials && (
                        <View className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border border-warm-white" />
                      )}
                    </View>
                    <Text className="text-xs font-medium text-bark dark:text-cream mt-1.5 text-center" numberOfLines={1}>
                      {link.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-dashed border-parchment dark:border-rally-900 items-center active:opacity-80"
              onPress={() => router.push('/profile/edit-link')}
            >
              <Ionicons name="key-outline" size={24} color={ic.placeholder} />
              <Text className="text-xs text-stone dark:text-parchment mt-2">
                Save your AES, LeagueApps, and hotel logins
              </Text>
            </Pressable>
          )}
        </View>

        {/* ============================================================ */}
        {/* SECTION 7: Feature Request                                   */}
        {/* ============================================================ */}
        <View className="bg-warm-white dark:bg-bark px-4 py-5">
          <SectionHeader
            icon="bulb"
            iconColor="#6A9E8A"
            title="New Feature Request"
          />
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
            <TextInput
              className="text-sm text-bark dark:text-cream min-h-[60px]"
              placeholder="What would make Rally even better?"
              placeholderTextColor="#8FA8BF"
              multiline
              value={featureRequest}
              onChangeText={setFeatureRequest}
              textAlignVertical="top"
            />
            <View className="flex-row justify-end mt-2">
              {featureSubmitted ? (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle" size={16} color="#6A9E8A" />
                  <Text className="text-xs text-green-600 ml-1">Sent!</Text>
                </View>
              ) : (
                <Pressable
                  className={`px-4 py-2 rounded-lg ${featureRequest.trim() ? 'bg-rally-600 active:opacity-80' : 'bg-parchment'}`}
                  onPress={handleFeatureSubmit}
                  disabled={!featureRequest.trim()}
                >
                  <Text className={`text-xs font-semibold ${featureRequest.trim() ? 'text-cream' : 'text-stone'}`}>
                    Submit
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ============================================================ */}
        {/* SECTION 8: Need Help?                                        */}
        {/* ============================================================ */}
        <View className="bg-cream dark:bg-bark-light px-4 py-5">
          <SectionHeader
            icon="help-circle"
            iconColor="#3B82B0"
            title="Need Help?"
          />
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-xl p-4 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
            onPress={() => Linking.openURL('mailto:hello@rally-hub.com')}
          >
            <View className="w-10 h-10 rounded-full bg-rally-50 dark:bg-rally-900/30 items-center justify-center mr-3">
              <Ionicons name="help-circle" size={20} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Need Help?</Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                Reach out to hello@rally-hub.com
              </Text>
            </View>
            <Ionicons name="mail-outline" size={18} color="#3B82B0" />
          </Pressable>
        </View>

        <ReferFriend />

        <View className="h-6" />
      </ScrollView>

      {/* Add menu modal (Android/web fallback) */}
      {showAddMenu && (
        <Modal transparent animationType="fade" visible={showAddMenu} onRequestClose={() => setShowAddMenu(false)}>
          <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowAddMenu(false)}>
            <View className="bg-warm-white dark:bg-bark-light rounded-t-2xl px-4 pb-8 pt-4">
              <Text className="text-lg font-bold text-bark dark:text-cream mb-4 text-center">Add New Detail Manually</Text>
              {[
                { label: 'Tournament', icon: 'trophy-outline' as const, color: '#6A9E8A', onPress: () => { setShowAddMenu(false); router.push('/tournament/add'); } },
                { label: 'Hotel', icon: 'bed-outline' as const, color: '#3B82B0', onPress: () => { setShowAddMenu(false); router.push('/booking/add-hotel'); } },
                { label: 'Flight', icon: 'airplane-outline' as const, color: '#7c3aed', onPress: () => { setShowAddMenu(false); router.push('/booking/add-flight'); } },
                { label: 'Team Event', icon: 'restaurant-outline' as const, color: '#d97706', onPress: () => { setShowAddMenu(false); router.push('/booking/add-team-event'); } },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  className="flex-row items-center py-3.5 border-b border-parchment dark:border-rally-900 active:opacity-70"
                  onPress={item.onPress}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: item.color + '15' }}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text className="text-base font-medium text-bark dark:text-cream">{item.label}</Text>
                </Pressable>
              ))}
              <Pressable className="mt-3 py-3 items-center active:opacity-70" onPress={() => setShowAddMenu(false)}>
                <Text className="text-sm font-semibold text-stone">Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
