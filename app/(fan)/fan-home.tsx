import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '@/components/Toast';
import AthleteAvatar, { athleteColor } from '@/components/AthleteAvatar';
import { formatDateRange } from '@/lib/dates';
import { CORAL, CORAL_DARK, CORAL_TINT, GOLD, TOURNAMENT_COLOR } from '@/lib/colors';
import { openDirections } from '@/lib/maps';
import { addEventsToCalendar } from '@/lib/calendar';
import {
  fetchFanFamily, fetchFanGames, fetchFollowedAthletes, groupByMonth, acceptFanInvite, takeFanCode,
  type FanTournament, type FanGame, type FollowedAthlete,
} from '@/lib/fan';
import { gameTitle, formatGameTime, hasStreetAddress } from '@/lib/teamEvents';
import { fanTournamentEvent, fanGameEvent } from '@/lib/fanCalendar';

const GAME_COLOR = '#0f766e';
type Item = { start_date: string; t?: FanTournament; g?: FanGame };

function Action({ icon, label, onPress, color = CORAL_DARK }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mt-2 active:opacity-70" style={{ backgroundColor: color + '14' }} accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color={color} />
      <Text className="text-xs font-semibold ml-1" style={{ color }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, on, color, onPress, avatar }: { label: string; on: boolean; color: string; onPress: () => void; avatar?: FollowedAthlete }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full mr-2 mb-2 border active:opacity-80"
      style={{ backgroundColor: on ? color : '#fff', borderColor: on ? color : '#D8E2EC', paddingLeft: avatar ? 3 : 12, paddingRight: 12, paddingVertical: avatar ? 3 : 7 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {avatar ? <View className="mr-1.5"><AthleteAvatar athlete={avatar} size={26} /></View> : null}
      <Text className="text-xs font-bold" style={{ color: on ? '#fff' : '#1E3A5F' }}>{label}</Text>
    </Pressable>
  );
}

/** Fan home: upcoming tournaments and games for the athletes they follow, by month. */
export default function FanHome() {
  const [rows, setRows] = useState<FanTournament[]>([]);
  const [games, setGames] = useState<FanGame[]>([]);
  const [athletes, setAthletes] = useState<FollowedAthlete[]>([]);
  const [athleteFilter, setAthleteFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    // Arrived from rally-hub.com/fan/<code>: link the invite first.
    const pending = takeFanCode();
    if (pending) {
      const { athleteFirst, error } = await acceptFanInvite(pending);
      if (error) showToast(error); else if (athleteFirst) showToast(`You're following ${athleteFirst}'s season`);
    }
    const [t, gm, a] = await Promise.all([fetchFanFamily(), fetchFanGames(), fetchFollowedAthletes()]);
    setRows(t);
    setGames(gm);
    setAthletes(a);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const join = async () => {
    if (!code.trim()) return;
    setJoining(true);
    const { athleteFirst, error } = await acceptFanInvite(code);
    setJoining(false);
    if (error) { showToast(error); return; }
    setCode('');
    showToast(`You're following ${athleteFirst ?? 'a new athlete'}'s season`);
    load();
  };

  // Teams for the chosen athlete (or everyone): season id → team name.
  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of [...rows, ...games]) {
      if (!x.season_id || (athleteFilter !== 'all' && x.athlete_id !== athleteFilter)) continue;
      m.set(x.season_id, x.team_name);
    }
    return [...m.entries()];
  }, [rows, games, athleteFilter]);

  const pick = <T extends { athlete_id: string; season_id?: string }>(xs: T[]) => xs.filter((x) =>
    (athleteFilter === 'all' || x.athlete_id === athleteFilter) && (teamFilter === 'all' || x.season_id === teamFilter));
  const shownT = pick(rows), shownG = pick(games);
  const items: Item[] = [
    ...shownT.map((t) => ({ start_date: t.start_date, t })),
    ...shownG.map((g) => ({ start_date: g.date, g })),
  ];
  const months = groupByMonth(items);
  const names = athletes.map((a) => a.first_name);
  const byId = new Map(athletes.map((a) => [a.athlete_id, a]));
  const avatarFor = (x: { athlete_id: string; athlete_first_name: string; athlete_photo_url?: string | null; athlete_avatar_color?: string | null }) =>
    byId.get(x.athlete_id) ?? { athlete_id: x.athlete_id, first_name: x.athlete_first_name, photo_url: x.athlete_photo_url, avatar_color: x.athlete_avatar_color };

  const addAll = () => addEventsToCalendar([...shownT.map(fanTournamentEvent), ...shownG.map(fanGameEvent)], 'event');

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={CORAL} />}
      >
        {/* Header: who you follow */}
        <View className="rounded-3xl p-5 mb-4" style={{ backgroundColor: '#1E3A5F' }}>
          <View className="flex-row mb-3">
            {athletes.map((a, i) => (
              <View key={a.athlete_id} style={{ marginLeft: i ? -10 : 0, borderWidth: 3, borderColor: '#1E3A5F', borderRadius: 999 }}>
                <AthleteAvatar athlete={a} size={48} />
              </View>
            ))}
          </View>
          <Text className="text-2xl font-extrabold text-white font-nunito-extrabold">
            {names.length ? `${names.join(' & ')}'s season` : 'Your season'}
          </Text>
          <Text className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Tournaments and games: where to go, live streams, tickets.</Text>
          {items.length ? (
            <Pressable onPress={addAll} className="flex-row items-center self-start rounded-full px-3.5 py-2 mt-4 active:opacity-80" style={{ backgroundColor: GOLD }} accessibilityLabel="Add all to calendar">
              <Ionicons name="calendar" size={14} color="#1E3A5F" />
              <Text className="text-xs font-extrabold ml-1.5" style={{ color: '#1E3A5F' }}>Add all to my calendar</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Filters: athlete, then team */}
        {athletes.length > 1 && (
          <View className="flex-row flex-wrap">
            <Chip label="Everyone" on={athleteFilter === 'all'} color="#1E3A5F" onPress={() => { setAthleteFilter('all'); setTeamFilter('all'); }} />
            {athletes.map((a) => (
              <Chip key={a.athlete_id} label={a.first_name} avatar={a} color={athleteColor(a)} on={athleteFilter === a.athlete_id} onPress={() => { setAthleteFilter(a.athlete_id); setTeamFilter('all'); }} />
            ))}
          </View>
        )}
        {teams.length > 1 && (
          <View className="flex-row flex-wrap">
            <Chip label="All teams" on={teamFilter === 'all'} color={CORAL} onPress={() => setTeamFilter('all')} />
            {teams.map(([id, name]) => <Chip key={id} label={name} color={CORAL} on={teamFilter === id} onPress={() => setTeamFilter(id)} />)}
          </View>
        )}

        {loading ? <ActivityIndicator color={CORAL} className="mt-10" /> : months.length === 0 ? (
          <View className="items-center mt-12 px-6">
            <Ionicons name="calendar-outline" size={40} color="#8FA8BF" />
            <Text className="text-base font-bold text-bark dark:text-cream mt-3">Nothing coming up yet</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
              {athletes.length ? "When the family adds tournaments or games, they'll show up here." : 'Enter the fan code from your invite below to follow an athlete.'}
            </Text>
          </View>
        ) : months.map((m) => (
          <View key={m.month} className="mt-4">
            <Text className="text-xs font-extrabold uppercase tracking-wider mb-2 ml-1" style={{ color: CORAL_DARK }}>{m.month}</Text>
            {m.items.map(({ t, g }) => {
              if (g) {
                const d = new Date(`${g.date}T12:00:00`);
                const time = formatGameTime(g.time);
                return (
                  <Pressable key={`g-${g.id}`} onPress={() => router.push({ pathname: '/fan-event' as any, params: { game: g.id } })} className="bg-white dark:bg-bark-light rounded-2xl p-4 mb-3 active:opacity-90" style={{ borderLeftWidth: 5, borderLeftColor: GAME_COLOR, shadowColor: '#1E3A5F', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} accessibilityLabel={`${gameTitle(g)}, details`}>
                    <View className="flex-row items-center">
                      <AthleteAvatar athlete={avatarFor(g)} size={40} />
                      <View className="flex-1 ml-3">
                        <View className="flex-row items-center">
                          <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: GAME_COLOR }}>{g.event_type === 'game' ? 'Game' : 'Event'}{g.home_away ? ` · ${g.home_away === 'home' ? 'Home' : 'Away'}` : ''}</Text>
                        </View>
                        <Text className="text-base font-bold text-bark dark:text-cream">{gameTitle(g)}</Text>
                        <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                          {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{time ? ` · ${time}` : ''}{g.venue_name ? ` · ${g.venue_name}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
                    </View>
                    {hasStreetAddress(g.address) ? (
                      <View className="flex-row flex-wrap"><Action icon="navigate" label="Directions" color={GAME_COLOR} onPress={() => openDirections(g.address)} /></View>
                    ) : null}
                  </Pressable>
                );
              }
              if (!t) return null;
              const venue = t.venues?.find((v) => v.is_confirmed) ?? t.venues?.[0];
              const stream = t.streaming_links?.[0]?.url ?? t.default_stream_url;
              return (
                <Pressable key={`${t.tournament_id}-${t.athlete_id}`} onPress={() => router.push({ pathname: '/fan-event' as any, params: { tournament: t.tournament_id } })} className="bg-white dark:bg-bark-light rounded-2xl p-4 mb-3 active:opacity-90" style={{ borderLeftWidth: 5, borderLeftColor: TOURNAMENT_COLOR, shadowColor: '#1E3A5F', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} accessibilityLabel={`${t.name}, details`}>
                  <View className="flex-row items-center">
                    <AthleteAvatar athlete={avatarFor(t)} size={40} />
                    <View className="flex-1 ml-3">
                      <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: TOURNAMENT_COLOR }}>Tournament · {t.team_name}</Text>
                      <Text className="text-base font-bold text-bark dark:text-cream">{t.name}</Text>
                      <Text className="text-xs text-stone dark:text-parchment mt-0.5">{formatDateRange(t.start_date, t.end_date)} · {venue?.label || t.location_city}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
                  </View>
                  {t.latest_update ? (
                    <View className="flex-row items-start rounded-xl px-3 py-2 mt-3" style={{ backgroundColor: CORAL_TINT }}>
                      <Ionicons name="megaphone" size={13} color={CORAL_DARK} style={{ marginTop: 1 }} />
                      <Text className="text-xs ml-1.5 flex-1" style={{ color: '#7a2e1a' }} numberOfLines={2}>{t.latest_update}</Text>
                    </View>
                  ) : null}
                  <View className="flex-row flex-wrap">
                    {hasStreetAddress(venue?.address) ? <Action icon="navigate" label="Directions" onPress={() => openDirections(venue!.address)} /> : null}
                    {stream ? <Action icon="videocam" label="Watch live" color="#dc2626" onPress={() => Linking.openURL(stream)} /> : null}
                    {t.ticket_link ? <Action icon="ticket" label="Tickets" color="#7c3aed" onPress={() => Linking.openURL(t.ticket_link!)} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Follow another family */}
        <View className="mt-8 rounded-2xl p-4 bg-white dark:bg-bark-light border border-parchment dark:border-rally-900">
          <Text className="text-sm font-bold text-bark dark:text-cream">{athletes.length ? 'Have another fan code?' : 'Enter your fan code'}</Text>
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">The 8 letters and numbers from your invite text (or paste the whole link).</Text>
          <View className="flex-row mt-2">
            <TextInput
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. AB23CD45"
              placeholderTextColor="#8FA8BF"
              className="flex-1 bg-cream dark:bg-bark rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              accessibilityLabel="Fan code"
            />
            <Pressable onPress={join} disabled={joining || !code.trim()} className="rounded-lg px-4 ml-2 items-center justify-center" style={{ backgroundColor: code.trim() ? CORAL : '#D8E2EC' }}>
              <Text className="text-xs font-bold text-white">{joining ? '…' : 'Follow'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
