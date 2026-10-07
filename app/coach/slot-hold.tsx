import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { fetchCoachClients, fetchPendingClients, updateSlot } from '@/lib/coach';
import { useCoachStore } from '@/stores/useCoachStore';
import { CORAL, CORAL_TINT, useIconColors } from '@/lib/colors';
import { notifySuccess, tapLight } from '@/lib/haptics';

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Hold an open time so nobody books it: for a client, a family you invited who
 * hasn't joined yet, or anyone by name, with a note ("waiting on Mom to
 * confirm"). Book it later with Assign athlete, or release it.
 */
export default function SlotHoldScreen() {
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const ic = useIconColors();
  const coach = useCoachStore((st) => st.coachProfile);
  const [slot, setSlot] = useState<{ starts_at: string; status: string; held_for: string | null; hold_note: string | null } | null>(null);
  const [names, setNames] = useState<{ name: string; invited: boolean }[]>([]);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: s }, c, pend] = await Promise.all([
        (supabase.from('slots') as any).select('starts_at, status, held_for, hold_note').eq('id', slotId).maybeSingle(),
        fetchCoachClients(),
        coach ? fetchPendingClients(coach.id) : Promise.resolve([]),
      ]);
      setSlot(s);
      const list = [
        ...c.data.filter((x) => x.status !== 'blocked').map((x) => ({ name: x.athlete_name, invited: false })),
        ...pend.map((x) => ({ name: [x.athlete_first_name, x.athlete_last_name].filter(Boolean).join(' '), invited: true })),
      ];
      setNames(list.filter((x, i) => list.findIndex((y) => y.name === x.name) === i));
      setPick(s?.held_for ?? '');
      setNote(s?.hold_note ?? '');
    })();
  }, [slotId, coach?.id]);

  const held = !!slot?.held_for;

  const save = async () => {
    const who = pick.trim();
    if (!who) { showToast('Pick a client or type a name'); return; }
    setBusy(true);
    const { error } = await updateSlot(slotId, { status: 'held', held_for: who, hold_note: note.trim() || null, held_at: new Date().toISOString() } as any);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    notifySuccess();
    showToast(`Held for ${who}`);
    router.back();
  };

  const release = async () => {
    setBusy(true);
    const { error } = await updateSlot(slotId, { status: 'open', held_for: null, hold_note: null, held_at: null } as any);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast('Hold released. Families can book this time again.');
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Hold for a client</Text>
        <View className="w-6" />
      </View>
      {!slot ? <ActivityIndicator color={CORAL} className="mt-10" /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-base font-bold text-bark dark:text-cream">{fmt(slot.starts_at)}</Text>
          <Text className="text-sm text-stone dark:text-parchment mt-1 mb-4">
            Families can't book a held time. When they're ready, tap Assign athlete on it to book them in, or release the hold.
          </Text>

          <Text className="text-xs font-bold uppercase tracking-wider text-stone mb-2">Hold for</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {names.map((n) => {
              const on = pick === n.name;
              return (
                <Pressable
                  key={n.name}
                  onPress={() => { tapLight(); setPick(n.name); }}
                  className="rounded-full px-3 py-2 border active:opacity-80"
                  style={{ backgroundColor: on ? CORAL : '#fff', borderColor: on ? CORAL : '#D8E2EC' }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text className="text-sm font-semibold" style={{ color: on ? '#fff' : '#1E3A5F' }}>{n.name}{n.invited ? ' · invited' : ''}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={names.some((n) => n.name === pick) ? '' : pick}
            onChangeText={setPick}
            placeholder={names.length ? 'Or type a name (e.g. a new family)' : 'Their name (e.g. a new family)'}
            placeholderTextColor="#8FA8BF"
            maxLength={80}
            className="bg-white dark:bg-bark-light rounded-xl px-4 py-3 mt-3 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
            accessibilityLabel="Hold for name"
          />

          <Text className="text-xs font-bold uppercase tracking-wider text-stone mt-4 mb-2">Note (only you see this)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Waiting on Mom to confirm"
            placeholderTextColor="#8FA8BF"
            maxLength={200}
            multiline
            className="bg-white dark:bg-bark-light rounded-xl px-4 py-3 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
            style={{ minHeight: 64, textAlignVertical: 'top' }}
            accessibilityLabel="Hold note"
          />

          <Pressable onPress={save} disabled={busy} className="rounded-xl py-3.5 items-center mt-5 active:opacity-80" style={{ backgroundColor: CORAL }} accessibilityLabel="Hold this time">
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">{held ? 'Update hold' : 'Hold this time'}</Text>}
          </Pressable>
          {held ? (
            <Pressable onPress={release} disabled={busy} className="py-3 items-center active:opacity-70" accessibilityLabel="Release hold">
              <Text className="text-sm font-semibold text-red-600">Release hold</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
