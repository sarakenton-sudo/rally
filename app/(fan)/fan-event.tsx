import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator, ImageBackground } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import AthleteAvatar from '@/components/AthleteAvatar';
import { formatDateRange } from '@/lib/dates';
import { CORAL, CORAL_DARK, CORAL_TINT, TOURNAMENT_COLOR } from '@/lib/colors';
import { openDirections } from '@/lib/maps';
import { addEventsToCalendar } from '@/lib/calendar';
import { tournamentHero } from '@/lib/tournamentHero';
import { fetchFanFamily, fetchFanGames, type FanTournament, type FanGame } from '@/lib/fan';
import { gameTitle, formatGameTime, hasStreetAddress } from '@/lib/teamEvents';
import { fanTournamentEvent, fanGameEvent } from '@/lib/fanCalendar';

const GAME_COLOR = '#0f766e';

function Card({ icon, color, title, children }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white dark:bg-bark-light rounded-2xl p-4 mt-3" style={{ shadowColor: '#1E3A5F', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
      <View className="flex-row items-center mb-2">
        <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: color + '1A' }}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        <Text className="text-xs font-extrabold uppercase tracking-wider ml-2" style={{ color }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Button({ icon, label, onPress, color = CORAL }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-center rounded-xl py-3 mt-2 active:opacity-80" style={{ backgroundColor: color }} accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color="#fff" />
      <Text className="text-sm font-bold text-white ml-1.5">{label}</Text>
    </Pressable>
  );
}

/**
 * Fan: one tournament or game. What a grandparent needs to go in person or
 * watch: where (address + directions), team code for tickets, stream, the
 * bracket, the family's latest update, and add to calendar. No travel.
 */
export default function FanEvent() {
  const { tournament: tid, game: gid } = useLocalSearchParams<{ tournament?: string; game?: string }>();
  const [t, setT] = useState<FanTournament | null>(null);
  const [g, setG] = useState<FanGame | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (tid) setT((await fetchFanFamily()).find((x) => x.tournament_id === tid) ?? null);
      if (gid) setG((await fetchFanGames()).find((x) => x.id === gid) ?? null);
      setLoading(false);
    })();
  }, [tid, gid]));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/fan-home' as any));
  const copyCode = async (code: string) => { await Clipboard.setStringAsync(code); showToast(`Team code ${code} copied`); };

  if (loading) return <SafeAreaView className="flex-1 bg-cream dark:bg-bark"><ActivityIndicator color={CORAL} className="mt-16" /></SafeAreaView>;
  const item = t ?? g;
  if (!item) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-bark items-center justify-center px-8">
        <Text className="text-base font-bold text-bark dark:text-cream">This isn't on the schedule anymore</Text>
        <Pressable onPress={back} className="mt-4"><Text className="text-sm font-semibold" style={{ color: CORAL_DARK }}>Back to the season</Text></Pressable>
      </SafeAreaView>
    );
  }

  const athlete = { first_name: item.athlete_first_name, photo_url: item.athlete_photo_url, avatar_color: item.athlete_avatar_color };
  const heroId = t ? t.tournament_id : g!.id;
  const venues = t ? (t.venues ?? []).filter((v) => v.label || v.address) : [];
  const stream = t ? (t.streaming_links?.[0]?.url ?? t.default_stream_url) : null;
  const gTime = g ? formatGameTime(g.time) : null;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        <ImageBackground source={tournamentHero(heroId)} resizeMode="cover" style={{ overflow: 'hidden' }} imageStyle={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors>
          <View className="px-5 pt-4 pb-6" style={{ backgroundColor: 'rgba(22,32,52,0.5)' }}>
            <Pressable onPress={back} className="flex-row items-center self-start mb-4" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={20} color="#fff" />
              <Text className="text-white text-sm ml-0.5">Season</Text>
            </Pressable>
            <View className="flex-row items-center mb-2">
              <View style={{ borderWidth: 2, borderColor: '#fff', borderRadius: 999 }}><AthleteAvatar athlete={athlete} size={36} /></View>
              <Text className="text-sm font-semibold text-white ml-2">{item.athlete_first_name} · {item.team_name}</Text>
            </View>
            <Text className="text-2xl font-extrabold text-white" style={{ textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8 }}>{t ? t.name : gameTitle(g!)}</Text>
            <Text className="text-base mt-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {t ? formatDateRange(t.start_date, t.end_date) : `${new Date(`${g!.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${gTime ? ` · ${gTime}` : ''}`}
            </Text>
          </View>
        </ImageBackground>

        <View className="px-4">
          {/* Latest from the family */}
          {t?.latest_update ? (
            <View className="rounded-2xl p-4 mt-3" style={{ backgroundColor: CORAL_TINT }}>
              <View className="flex-row items-center"><Ionicons name="megaphone" size={15} color={CORAL_DARK} /><Text className="text-xs font-extrabold uppercase tracking-wider ml-1.5" style={{ color: CORAL_DARK }}>Latest from the family</Text></View>
              <Text className="text-sm text-bark mt-1.5">{t.latest_update}</Text>
              {t.latest_update_at ? <Text className="text-[11px] text-stone mt-1">{new Date(t.latest_update_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text> : null}
            </View>
          ) : null}

          {/* Where */}
          <Card icon="location" color={t ? TOURNAMENT_COLOR : GAME_COLOR} title="Where">
            {t ? (
              venues.length ? venues.map((v, i) => (
                <View key={i} className={i ? 'mt-3 pt-3 border-t border-parchment' : ''}>
                  <Text className="text-base font-bold text-bark dark:text-cream">{v.label || t.location_city}</Text>
                  {v.address ? <Text className="text-sm text-stone dark:text-parchment mt-0.5">{v.address}</Text> : null}
                  {hasStreetAddress(v.address) ? <Button icon="navigate" label="Directions" color={TOURNAMENT_COLOR} onPress={() => openDirections(v.address)} /> : null}
                </View>
              )) : <Text className="text-sm text-stone">{t.location_city || 'Location coming soon'}</Text>
            ) : (
              <>
                <Text className="text-base font-bold text-bark dark:text-cream">{g!.venue_name || 'Location coming soon'}</Text>
                {g!.address ? <Text className="text-sm text-stone dark:text-parchment mt-0.5">{g!.address}</Text> : null}
                {hasStreetAddress(g!.address) ? <Button icon="navigate" label="Directions" color={GAME_COLOR} onPress={() => openDirections(g!.address)} /> : null}
              </>
            )}
          </Card>

          {/* Tickets + team code */}
          {t && (t.team_code || t.ticket_link) ? (
            <Card icon="ticket" color="#7c3aed" title="Tickets">
              {t.team_code ? (
                <Pressable onPress={() => copyCode(t.team_code!)} className="flex-row items-center rounded-xl px-4 py-3 active:opacity-80" style={{ backgroundColor: '#7c3aed12' }} accessibilityLabel={`Team code ${t.team_code}, tap to copy`}>
                  <View className="flex-1">
                    <Text className="text-xs text-stone">Team code (you may need it to buy tickets)</Text>
                    <Text className="text-xl font-extrabold tracking-widest" style={{ color: '#7c3aed' }}>{t.team_code}</Text>
                  </View>
                  <Ionicons name="copy-outline" size={18} color="#7c3aed" />
                </Pressable>
              ) : null}
              {t.ticket_link ? <Button icon="open-outline" label="Buy tickets" color="#7c3aed" onPress={() => Linking.openURL(t.ticket_link!)} /> : null}
            </Card>
          ) : null}

          {/* Watch + bracket */}
          {t && (stream || t.schedule_link) ? (
            <Card icon="videocam" color="#dc2626" title="Follow along">
              {stream ? <Button icon="videocam" label="Watch live" color="#dc2626" onPress={() => Linking.openURL(stream)} /> : null}
              {t.schedule_link ? <Button icon="list" label="Schedule & brackets" color="#1E3A5F" onPress={() => Linking.openURL(t.schedule_link!)} /> : null}
            </Card>
          ) : null}

          {g?.notes ? (
            <Card icon="document-text" color="#1E3A5F" title="Notes"><Text className="text-sm text-bark dark:text-cream">{g.notes}</Text></Card>
          ) : null}

          <Pressable
            onPress={() => addEventsToCalendar([t ? fanTournamentEvent(t) : fanGameEvent(g!)], t ? 'tournament' : 'game')}
            className="flex-row items-center justify-center rounded-xl py-3.5 mt-4 border-2 active:opacity-80"
            style={{ borderColor: CORAL }}
            accessibilityLabel="Add to my calendar"
          >
            <Ionicons name="calendar-outline" size={17} color={CORAL_DARK} />
            <Text className="text-sm font-bold ml-1.5" style={{ color: CORAL_DARK }}>Add to my calendar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
