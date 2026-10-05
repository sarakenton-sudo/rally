import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '@/components/Toast';
import { formatDateRange } from '@/lib/dates';
import { TOURNAMENT_COLOR } from '@/lib/colors';
import { openDirections } from '@/lib/maps';
import {
  fetchFanFamily, fetchFollowedAthletes, groupByMonth, acceptFanInvite, takeFanCode, type FanTournament,
} from '@/lib/fan';

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mt-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70" accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color="#3B82B0" />
      <Text className="text-xs font-semibold text-rally-600 ml-1">{label}</Text>
    </Pressable>
  );
}

/** Fan home: every upcoming tournament for the athletes they follow, by month. */
export default function FanHome() {
  const [rows, setRows] = useState<FanTournament[]>([]);
  const [athletes, setAthletes] = useState<{ athlete_id: string; first_name: string }[]>([]);
  const [filter, setFilter] = useState<string>('all');
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
    const [t, a] = await Promise.all([fetchFanFamily(), fetchFollowedAthletes()]);
    setRows(t);
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

  const shown = filter === 'all' ? rows : rows.filter((r) => r.athlete_id === filter);
  const months = groupByMonth(shown);
  const names = athletes.map((a) => a.first_name);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
          {names.length ? `${names.join(' & ')}'s season` : 'Your season'}
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mt-1">Tournaments, locations, live streams and tickets.</Text>

        {athletes.length > 1 && (
          <View className="flex-row flex-wrap mt-3">
            {[{ athlete_id: 'all', first_name: 'Everyone' }, ...athletes].map((a) => {
              const on = filter === a.athlete_id;
              return (
                <Pressable key={a.athlete_id} onPress={() => setFilter(a.athlete_id)} className={`rounded-full px-3 py-1.5 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`}>
                  <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-parchment'}`}>{a.first_name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {loading ? <ActivityIndicator color="#3B82B0" className="mt-10" /> : months.length === 0 ? (
          <View className="items-center mt-12 px-6">
            <Ionicons name="calendar-outline" size={40} color="#8FA8BF" />
            <Text className="text-base font-bold text-bark dark:text-cream mt-3">No upcoming tournaments yet</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
              {athletes.length ? "When the family adds tournaments, they'll show up here and you'll get a heads-up on game day." : 'Enter the fan code from your invite below to follow an athlete.'}
            </Text>
          </View>
        ) : months.map((m) => (
          <View key={m.month} className="mt-5">
            <Text className="text-xs font-bold uppercase tracking-wider text-stone mb-2 ml-1">{m.month}</Text>
            {m.items.map((t) => {
              const venue = t.venues?.find((v) => v.is_confirmed) ?? t.venues?.[0];
              const stream = t.streaming_links?.[0]?.url ?? t.default_stream_url;
              return (
                <View key={`${t.tournament_id}-${t.athlete_id}`} className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mb-3 border border-parchment dark:border-rally-900" style={{ borderLeftWidth: 4, borderLeftColor: TOURNAMENT_COLOR }}>
                  <Text className="text-base font-bold text-bark dark:text-cream">{t.name}</Text>
                  <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                    {formatDateRange(t.start_date, t.end_date)} · {venue?.label || t.location_city}{athletes.length > 1 ? ` · ${t.athlete_first_name}` : ''}
                  </Text>
                  <Text className="text-xs text-stone dark:text-parchment">{t.team_name}</Text>
                  <View className="flex-row flex-wrap">
                    {venue?.address ? <Action icon="navigate" label="Directions" onPress={() => openDirections(venue.address)} /> : null}
                    {stream ? <Action icon="videocam" label="Watch live" onPress={() => Linking.openURL(stream)} /> : null}
                    {t.ticket_link ? <Action icon="ticket" label="Tickets" onPress={() => Linking.openURL(t.ticket_link!)} /> : null}
                    {t.schedule_link ? <Action icon="list" label="Schedule" onPress={() => Linking.openURL(t.schedule_link!)} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* Follow another family */}
        <View className="mt-8 rounded-2xl p-4 bg-warm-white dark:bg-bark-light border border-parchment dark:border-rally-900">
          <Text className="text-sm font-bold text-bark dark:text-cream">Have another fan code?</Text>
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">Paste the code or link from an invite to follow another athlete.</Text>
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
            <Pressable onPress={join} disabled={joining || !code.trim()} className={`rounded-lg px-4 ml-2 items-center justify-center ${code.trim() ? 'bg-rally-600' : 'bg-parchment'}`}>
              <Text className="text-xs font-bold text-cream">{joining ? '…' : 'Follow'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
