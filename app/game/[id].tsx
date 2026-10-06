import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '@/components/Toast';
import { openDirections } from '@/lib/maps';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { fetchTeamEvent, deleteTeamEvent, gameTitle, formatGameTime, hasStreetAddress } from '@/lib/teamEvents';

const GAME_COLOR = '#0f766e';
type Game = NonNullable<Awaited<ReturnType<typeof fetchTeamEvent>>>;

/** Game / team event detail: who, when, where (+ directions), and delete. */
export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchTeamEvent(String(id)).then((g) => { setGame(g); setLoading(false); }); }, [id]);

  const remove = async () => {
    if (!game) return;
    setBusy(true);
    const { error } = await deleteTeamEvent(game.id);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast('Game deleted');
    router.canGoBack() ? router.back() : router.replace('/season');
  };

  if (loading || !game) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
        <Header ic={ic} />
        {loading ? <ActivityIndicator color="#3B82B0" className="mt-8" /> : (
          <Text className="text-sm text-stone text-center mt-10">This game isn't available.</Text>
        )}
      </SafeAreaView>
    );
  }

  const d = new Date(`${game.date}T12:00:00`);
  const time = formatGameTime(game.time);
  const kind = game.event_type === 'game' ? 'Game' : game.event_type === 'practice' ? 'Practice' : 'Team event';
  const canMap = hasStreetAddress(game.address);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <Header ic={ic} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900" style={{ borderLeftWidth: 4, borderLeftColor: GAME_COLOR }}>
          <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: GAME_COLOR }}>
            {kind}{game.home_away ? ` · ${game.home_away === 'home' ? 'Home' : 'Away'}` : ''}
          </Text>
          <Text className="text-xl font-bold text-bark dark:text-cream mt-1">{gameTitle(game)}</Text>
          {game.event_type === 'game' && game.opponent && game.name && game.name !== gameTitle(game) ? (
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">{game.name}</Text>
          ) : null}
          <Text className="text-sm text-bark dark:text-cream mt-2">{d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          {time ? <Text className="text-sm text-stone dark:text-parchment">{time}</Text> : null}
          {game.team_name ? (
            <Text className="text-xs text-stone dark:text-parchment mt-2">{game.athlete_first_name ? `${game.athlete_first_name} · ` : ''}{game.team_name}</Text>
          ) : null}
        </View>

        {/* Where */}
        <Pressable
          disabled={!canMap}
          onPress={() => openDirections(game.address)}
          className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-3 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
          accessibilityLabel={canMap ? `Directions to ${game.venue_name || game.address}` : 'Location'}
        >
          <Ionicons name="location-outline" size={20} color={GAME_COLOR} />
          <View className="flex-1 ml-3">
            <Text className="text-base font-semibold text-bark dark:text-cream">{game.venue_name || (canMap ? game.address : 'Location not added')}</Text>
            {game.venue_name && game.address ? <Text className="text-xs text-stone dark:text-parchment mt-0.5">{game.address}</Text> : null}
          </View>
          {canMap ? (
            <View className="flex-row items-center bg-rally-50 dark:bg-rally-900/30 px-3 py-1.5 rounded-lg">
              <Ionicons name="navigate-outline" size={14} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 ml-1">Directions</Text>
            </View>
          ) : null}
        </Pressable>

        {game.notes ? (
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-3 border border-parchment dark:border-rally-900">
            <Text className="text-xs font-bold uppercase tracking-wider text-stone mb-1">Notes</Text>
            <Text className="text-sm text-bark dark:text-cream">{game.notes}</Text>
          </View>
        ) : null}

        {/* Delete: second tap confirms */}
        {confirm ? (
          <View className="flex-row mt-6" style={{ gap: 8 }}>
            <Pressable onPress={() => setConfirm(false)} className="flex-1 rounded-xl py-3 items-center border border-parchment dark:border-rally-900 active:opacity-70">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Keep it</Text>
            </Pressable>
            <Pressable onPress={remove} disabled={busy} className="flex-1 rounded-xl py-3 items-center active:opacity-80" style={{ backgroundColor: '#DC2626' }} accessibilityLabel="Confirm delete">
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-bold text-white">Delete {kind.toLowerCase()}</Text>}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => { tapLight(); setConfirm(true); }} className="mt-6 py-3 items-center active:opacity-70" accessibilityLabel={`Delete ${kind.toLowerCase()}`}>
            <Text className="text-sm font-semibold text-red-600">Delete {kind.toLowerCase()}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ ic }: { ic: ReturnType<typeof useIconColors> }) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/season'))} className="p-1" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Game</Text>
        <View className="w-6" />
      </View>
    </>
  );
}
