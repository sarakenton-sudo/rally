import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchUnpaidLessons, markBookingPaid, fmtMoney, isSupabaseConfigured, type UnpaidLesson } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import { showToast } from '@/components/Toast';

const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'venmo', label: 'Venmo' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'other', label: 'Other' },
] as const;

/** "Record a payment" from the coach + sheet: unpaid lessons, one tap to mark paid. */
export default function UnpaidLessonsScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [rows, setRows] = useState<UnpaidLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    setRows(await fetchUnpaidLessons(coachProfile.id));
    setLoading(false);
  }, [coachProfile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pay = async (r: UnpaidLesson, method: (typeof METHODS)[number]['key']) => {
    setBusy(r.id);
    const { error } = await markBookingPaid(r.id, method);
    setBusy(null);
    if (error) { notifyError(); showToast(error.message); return; }
    notifySuccess();
    setRows((all) => all.filter((x) => x.id !== r.id));
    showToast(`${fmtMoney(r.price_cents)} recorded · ${method}`);
  };

  const now = Date.now();
  const past = rows.filter((r) => r.slots && new Date(r.slots.ends_at).getTime() <= now);
  const upcoming = rows.filter((r) => !r.slots || new Date(r.slots.ends_at).getTime() > now);

  const Section = ({ title, items }: { title: string; items: UnpaidLesson[] }) => items.length ? (
    <View className="mb-4">
      <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">{title}</Text>
      {items.map((r) => {
        const when = r.slots ? new Date(r.slots.starts_at) : null;
        return (
          <View key={r.id} className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2">
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-bark dark:text-cream">
                  {r.athletes ? `${r.athletes.first_name}${r.athletes.last_name ? ' ' + r.athletes.last_name : ''}` : 'Athlete'}
                </Text>
                <Text className="text-xs text-stone dark:text-parchment">
                  {when ? `${when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
                </Text>
                {r.payment_status === 'failed' && r.last_charge_error ? (
                  <Text className="text-[11px] text-red-600 mt-0.5">Card payment failed: {r.last_charge_error}</Text>
                ) : null}
              </View>
              <Text className="text-base font-bold text-bark dark:text-cream">{fmtMoney(r.price_cents)}</Text>
            </View>
            <View className="flex-row flex-wrap items-center mt-2">
              <Text className="text-xs text-stone mr-2">Paid by:</Text>
              {METHODS.map((m) => (
                <Pressable
                  key={m.key}
                  disabled={busy === r.id}
                  onPress={() => pay(r, m.key)}
                  className="rounded-full px-3 py-1.5 mr-1.5 mb-1 border border-green-600/40 active:opacity-70"
                  accessibilityLabel={`Mark paid by ${m.label}`}
                >
                  <Text className="text-xs font-semibold text-green-700 dark:text-green-400">{m.label}</Text>
                </Pressable>
              ))}
              {busy === r.id && <ActivityIndicator size="small" color="#3B82B0" />}
            </View>
          </View>
        );
      })}
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Record a payment</Text>
        <View className="w-6" />
      </View>
      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : rows.length === 0 ? (
        <View className="items-center mt-16 px-8">
          <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
          <Text className="text-base font-bold text-bark dark:text-cream mt-2">All paid up</Text>
          <Text className="text-sm text-stone dark:text-parchment text-center mt-1">No unpaid lessons right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Section title="Lesson happened" items={past} />
          <Section title="Upcoming — collected early" items={upcoming} />
          <Text className="text-[11px] text-stone text-center mt-2">Lessons paid in the app are recorded automatically.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
