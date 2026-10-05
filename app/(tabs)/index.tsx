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
import { fetchMyUpcomingLessons, fetchMyCoaches, sessionKindStyle, isSupabaseConfigured as coachingConfigured, type ParentLesson } from '@/lib/coach';
import { fetchMyCharges, type ParentCharge } from '@/lib/payments';
import { fetchMyCoachInvites } from '@/lib/coachInvites';
import { pickNextUp, showCoachInvitePrompt } from '@/lib/nextUp';
import { getPref, setPref } from '@/lib/prefs';
import NextUpCard from '@/components/home/NextUpCard';
import LessonCard from '@/components/LessonCard';

const INVITE_DISMISS_KEY = 'rally.coachInvitePromptDismissedAt';

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
  const tournamentTickets = useSeasonStore((s) => s.tournamentTickets);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const seasons = useSeasonStore((s) => s.seasons);
  const athletes = useSeasonStore((s) => s.athletes);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const ic = useIconColors();
  const { user } = useAuth();
  const { refresh, isRefreshing } = useDataRefresh();

  // Lessons/clinics booked with coaches, merged into Next 30 Days.
  const [lessons, setLessons] = useState<ParentLesson[]>([]);
  const loadLessons = useCallback(() => {
    if (!coachingConfigured) return;
    fetchMyUpcomingLessons(30).then(({ data }) => setLessons(data));
  }, []);

  const [athleteFilter, setAthleteFilter] = useState<string>('all');

  const externalLinks = adminConfig?.external_links ?? [];
  const familyLogins = externalLinks.filter((l) => l.scope !== 'athlete' && (l.username || l.password || l.url));

  // Growth prompts + lesson payments for "Needs you".
  const [hasCoaches, setHasCoaches] = useState(true);
  const [lastInviteAt, setLastInviteAt] = useState<string | null>(null);
  const [inviteDismissedAt, setInviteDismissedAt] = useState<string | null>(null);
  const [failedCharges, setFailedCharges] = useState<ParentCharge[]>([]);
  const loadFamilyExtras = useCallback(() => {
    if (!coachingConfigured) return;
    fetchMyCoaches().then(({ data }) => setHasCoaches(data.some((c) => c.user_id !== user?.id)));
    fetchMyCoachInvites().then((inv) => setLastInviteAt(inv[0]?.last_sent_at ?? null));
    fetchMyCharges().then((rows) => setFailedCharges(rows.filter((r) => r.payment_status === 'failed' && r.status !== 'cancelled')));
    getPref(INVITE_DISMISS_KEY).then(setInviteDismissedAt);
  }, [user?.id]);

  // Refresh data when Home tab gains focus (keeps co-admins in sync)
  useFocusEffect(
    useCallback(() => {
      refresh();
      loadLessons();
      loadFamilyExtras();
    }, [refresh, loadLessons, loadFamilyExtras])
  );

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
    const cards: { priority: number; text: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; color: string; bgColor: string; onPress: () => void; onDismiss?: () => void }[] = [];

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

    // Priority 3: Tickets — either "View Tickets" (purchased) or "Buy Tickets" (not yet)
    const ticketTournaments = seasonTournaments.filter((t) => {
      if (!t.ticket_link) return false;
      const d = daysUntil(t.start_date);
      const isActive = d <= 0 && daysUntil(t.end_date) >= 0;
      const tix = tournamentTickets.filter((tk) => tk.tournament_id === t.id);
      // Always show purchased tickets during active tournament or within 7 days
      if (tix.length > 0 && (isActive || (d >= 0 && d <= 7))) return true;
      // Show buy prompt if not purchased
      if (t.tickets_purchased || tix.length > 0) return false;
      if (d >= 0 && d <= 7) return true;
      if (t.ticket_sales_date) {
        const salesD = daysUntil(t.ticket_sales_date);
        return salesD <= 0;
      }
      return false;
    });
    for (const t of ticketTournaments) {
      const activeSeason = seasons.find((s) => s.id === activeSeasonId);
      const teamCode = activeSeason?.team_code;
      const tix = tournamentTickets.filter((tk) => tk.tournament_id === t.id);
      const hasPurchased = tix.length > 0;
      const firstTicket = tix[0];

      // Active tournament = current date is within start/end dates → top priority
      const isActive = daysUntil(t.start_date) <= 0 && daysUntil(t.end_date) >= 0;
      const ticketPriority = isActive ? 0 : 3;

      if (hasPurchased && firstTicket?.ticket_url) {
        // View purchased ticket
        cards.push({
          priority: ticketPriority,
          text: `View Tickets — ${t.name}`,
          subtitle: `${tix.length} ticket${tix.length > 1 ? 's' : ''} · ${firstTicket.ticket_holder_name}${tix.length > 1 ? ` +${tix.length - 1}` : ''}`,
          icon: 'ticket',
          color: '#16a34a',
          bgColor: '#DCFCE7',
          onPress: () => {
            if (Platform.OS === 'web') {
              window.open(firstTicket.ticket_url!, '_blank');
            } else {
              Linking.openURL(firstTicket.ticket_url!);
            }
          },
        });
      } else {
        // Buy tickets
        cards.push({
          priority: ticketPriority,
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


    // A coach lesson payment that failed — the family needs to update their card.
    for (const c of failedCharges) {
      cards.push({
        priority: 1,
        text: `Lesson payment didn't go through`,
        subtitle: `${c.athletes?.first_name ?? 'Lesson'} with ${c.coaches?.display_name ?? 'your coach'} — update your card`,
        icon: 'card',
        color: '#dc2626',
        bgColor: '#FEE2E2',
        onPress: () => router.push('/settings/payments'),
      });
    }

    // Growth: families with no coach on RallyHUB yet (at most monthly).
    if (showCoachInvitePrompt({ hasCoaches, lastInviteAt, dismissedAt: inviteDismissedAt })) {
      const who = athletes.length === 1 ? athletes[0].first_name : 'your athlete';
      cards.push({
        priority: 7,
        text: `Does ${who} take lessons? Invite the coach`,
        subtitle: 'Book and pay for lessons right here — free for coaches',
        icon: 'person-add',
        color: '#3B82B0',
        bgColor: '#DBEAFE',
        onPress: () => router.push('/lessons'),
        onDismiss: () => { const now = new Date().toISOString(); setInviteDismissedAt(now); setPref(INVITE_DISMISS_KEY, now); },
      });
    }

    return cards.sort((a, b) => a.priority - b.priority);
  }, [emailsToReview, seasonTournaments, hotelBookings, flightBookings, tournamentTickets, failedCharges, hasCoaches, lastInviteAt, inviteDismissedAt, athletes]);

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

  const filteredLessons = useMemo(
    () => (athleteFilter === 'all' ? lessons : lessons.filter((l) => l.athlete_id === athleteFilter)),
    [lessons, athleteFilter],
  );

  // One chronological timeline: tournaments + lessons.
  const next30Timeline = useMemo(() => {
    const items: ({ kind: 'tournament'; date: string; t: typeof tournaments[0] } | { kind: 'lesson'; date: string; l: ParentLesson })[] = [
      ...filteredNext30.map((t) => ({ kind: 'tournament' as const, date: t.start_date, t })),
      ...filteredLessons.map((l) => ({ kind: 'lesson' as const, date: l.starts_at.slice(0, 10), l })),
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredNext30, filteredLessons]);

  const hasFlightConflict = (tournamentId: string) => {
    const seen = new Set<string>();
    for (const f of flightBookings.filter((x) => x.tournament_id === tournamentId)) {
      for (const name of f.traveler_names) {
        const key = `${name.toLowerCase().trim()}|${f.departure_date}`;
        if (seen.has(key)) return true;
        seen.add(key);
      }
    }
    return false;
  };

  const getAthleteForTournament = (t: typeof tournaments[0]) => {
    const season = seasons.find((s) => s.id === t.season_id);
    return season ? athletes.find((a) => a.id === season.athlete_id) ?? null : null;
  };


  // ─── Next up ───
  const next = useMemo(() => pickNextUp(tournaments, lessons), [tournaments, lessons]);
  const nextTournament = next?.kind === 'tournament' ? tournaments.find((t) => t.id === next.id) : undefined;
  const nextLesson = next?.kind === 'lesson' ? lessons.find((l) => l.id === next.id) : undefined;
  const nextSeason = nextTournament ? seasons.find((s) => s.id === nextTournament.season_id) : undefined;
  const nextAthleteName = hasMultipleAthletes
    ? (nextTournament ? getAthleteForTournament(nextTournament)?.first_name : athletes.find((a) => a.id === nextLesson?.athlete_id)?.first_name)
    : undefined;

  return (
    <View className="flex-1 bg-warm-white dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        {/* 1. Next up — the one thing to look at */}
        <View className="px-4 pt-4 pb-2">
          <NextUpCard
            next={next}
            tournament={nextTournament}
            lesson={nextLesson}
            hotels={nextTournament ? hotelBookings.filter((h) => h.tournament_id === nextTournament.id) : []}
            teamCode={nextSeason?.team_code}
            familyLogins={familyLogins}
            athleteName={nextAthleteName}
          />
        </View>

        {/* 2. Needs you — hidden when there's nothing to do */}
        <View className="px-4 pt-4 pb-1">
          <SectionHeader icon="flash" iconColor="#d97706" title="Needs you" />
          {actionCards.length === 0 ? (
            <View className="flex-row items-center mb-2 px-1">
              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
              <Text className="text-sm text-stone dark:text-parchment ml-2">You're all caught up.</Text>
            </View>
          ) : actionCards.map((card, i) => (
            <Pressable
              key={`${card.priority}-${card.text}-${i}`}
              className="rounded-xl p-4 mb-2 flex-row items-center active:opacity-80"
              style={{ backgroundColor: card.bgColor }}
              onPress={card.onPress}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: card.color + '20' }}>
                <Ionicons name={card.icon} size={20} color={card.color} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-bark">{card.text}</Text>
                <Text className="text-xs text-stone mt-0.5">{card.subtitle}</Text>
              </View>
              {card.onDismiss ? (
                <Pressable onPress={card.onDismiss} hitSlop={10} className="p-1" accessibilityLabel="Not now">
                  <Ionicons name="close" size={16} color="#8FA8BF" />
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
              )}
            </Pressable>
          ))}
        </View>

        {/* 3. Coming up — tournaments, lessons, team events */}
        <View className="px-4 pt-4">
          <SectionHeader
            icon="calendar"
            iconColor="#7c3aed"
            title="Coming up"
            subtitle="Next 30 days"
            right={
              <Pressable
                onPress={() => { tapLight(); router.push('/lessons'); }}
                className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: '#3B82B0' }}
                accessibilityLabel="Book a lesson"
              >
                <Ionicons name="add" size={14} color="#fff" />
                <Text className="text-xs font-bold text-white ml-0.5">Book a lesson</Text>
              </Pressable>
            }
          />

          {hasMultipleAthletes && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
              <Pressable
                className={`px-3 py-1.5 rounded-full border ${athleteFilter === 'all' ? 'bg-rally-600 border-rally-600' : 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'}`}
                onPress={() => setAthleteFilter('all')}
              >
                <Text className={`text-xs font-semibold ${athleteFilter === 'all' ? 'text-cream' : 'text-bark dark:text-parchment'}`}>All Athletes</Text>
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
                    <Text className={`text-xs font-semibold ${isSelected ? 'text-cream' : 'text-bark'}`}>{a.first_name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {next30Timeline.length > 0 ? (
            next30Timeline.map((item) => item.kind === 'lesson' ? (
              <LessonCard
                key={`l-${item.l.id}`}
                lesson={item.l}
                athleteName={hasMultipleAthletes ? athletes.find((a) => a.id === item.l.athlete_id)?.first_name : undefined}
              />
            ) : (
              <TournamentCard
                key={`t-${item.t.id}`}
                tournament={item.t}
                hotelCount={hotelBookings.filter((h) => h.tournament_id === item.t.id).length}
                flightCount={flightBookings.filter((f) => f.tournament_id === item.t.id).length}
                backupHotelCount={hotelBookings.filter((h) => h.tournament_id === item.t.id && h.is_backup).length}
                hasFlightConflict={hasFlightConflict(item.t.id)}
                athlete={getAthleteForTournament(item.t)}
                onPress={() => router.push(`/tournament/${item.t.id}`)}
              />
            ))
          ) : (
            <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-5 border border-parchment dark:border-rally-900 items-center">
              <Ionicons name="calendar-outline" size={32} color={ic.placeholder} />
              <Text className="text-sm text-stone dark:text-parchment mt-2">Nothing in the next 30 days</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
