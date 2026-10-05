import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { supabase } from '@/lib/supabase';
import { fetchMyCoach, isSupabaseConfigured } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

type Scope = 'self' | 'clients';
type Row = { key: string; title: string; detail: string };

// What the coach gets. Keys match coach_notification_settings.self (00089).
const SELF: Row[] = [
  { key: 'lesson_request', title: 'New lesson requests', detail: 'A family asks for one of your open times' },
  { key: 'family_reschedule', title: 'Move requests', detail: 'A family asks to move a lesson, or answers your request' },
  { key: 'family_cancelled', title: 'Family cancellations', detail: 'A family cancels a lesson' },
  { key: 'heads_up', title: '1-hour heads-up', detail: 'Before each lesson' },
  { key: 'morning_summary', title: 'Morning summary', detail: "Today's lessons and what they're worth, around 7am" },
  { key: 'tomorrow_schedule', title: "Tomorrow's schedule", detail: 'Each evening at 7pm when you have lessons the next day' },
  { key: 'week_ahead', title: 'Week ahead', detail: 'Sunday at 7pm: lessons, money booked, gyms to reserve' },
  { key: 'unpaid_nudge', title: 'Unpaid lessons', detail: 'Evening reminder to record cash, Venmo or Zelle' },
];

// What the coach's families get. Keys match coach_notification_settings.clients.
const CLIENTS: Row[] = [
  { key: 'reminder_24h', title: 'Reminder the day before', detail: 'Push and email to the parent' },
  { key: 'day_before_athlete', title: 'Day-before confirmation to the player', detail: "Push to the athlete's own RallyHUB login" },
  { key: 'reminder_2h', title: '2-hour reminder', detail: 'Push to the parent' },
  { key: 'lesson_changes', title: 'Lesson changes', detail: 'When you book, move or cancel a lesson' },
  { key: 'announcements', title: 'Open-time announcements', detail: 'Lets you announce open times to families' },
];

/** Coach → Business → Notifications: every notification, on/off for the coach and for their families. */
export default function CoachNotificationsScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<{ self: Record<string, boolean>; clients: Record<string, boolean> }>({ self: {}, clients: {} });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    let c = coach;
    if (!c) { const { data } = await fetchMyCoach(user.id); if (data) { setCoachProfile(data); c = data; } }
    if (!c) { setLoading(false); return; }
    const { data } = await (supabase.from('coach_notification_settings') as any).select('self, clients').eq('coach_id', c.id).maybeSingle();
    setValues({ self: data?.self ?? {}, clients: data?.clients ?? {} });
    setLoading(false);
  }, [user?.id, coach?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOn = (scope: Scope, key: string) => values[scope][key] !== false; // missing = on

  const toggle = async (scope: Scope, key: string, on: boolean) => {
    if (!coach) return;
    tapLight();
    const prev = values;
    const next = { ...values, [scope]: { ...values[scope], [key]: on } };
    setValues(next);
    setError(null);
    const { error: e } = await (supabase.from('coach_notification_settings') as any)
      .upsert({ coach_id: coach.id, self: next.self, clients: next.clients, updated_at: new Date().toISOString() }, { onConflict: 'coach_id' });
    if (e) { setValues(prev); setError(`Couldn't save: ${e.message}`); }
  };

  const Section = ({ title, note, rows, scope }: { title: string; note: string; rows: Row[]; scope: Scope }) => (
    <View className="mb-6">
      <Text className="text-xs font-bold uppercase tracking-wider text-stone mb-1 ml-1">{title}</Text>
      <Text className="text-xs text-stone dark:text-parchment mb-2 ml-1">{note}</Text>
      <View className="bg-warm-white dark:bg-bark-light rounded-2xl border border-parchment dark:border-rally-900 overflow-hidden">
        {rows.map((r, i) => {
          const on = isOn(scope, r.key);
          return (
            <View key={r.key} className={`flex-row items-center px-4 py-3 ${i ? 'border-t border-parchment dark:border-rally-900' : ''}`}>
              <View className="flex-1 mr-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">{r.title}</Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">{r.detail}</Text>
              </View>
              <Switch
                value={on}
                onValueChange={(v) => toggle(scope, r.key, v)}
                trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
                thumbColor={on ? '#3B82B0' : '#FEFEFE'}
                accessibilityLabel={r.title}
              />
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1 mr-2" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Notifications</Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : !coach ? (
        <Text className="text-sm text-stone text-center mt-10 px-8">Set up your coaching profile first.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {error ? (
            <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#fee2e2' }}>
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          ) : null}
          <Section title="For you" note="Push notifications (and email where noted) RallyHUB sends you." rows={SELF} scope="self" />
          <Section title="For your clients" note="Turning one off stops it for every family you coach." rows={CLIENTS} scope="clients" />
          <Text className="text-[11px] text-stone dark:text-parchment px-1 leading-4">
            Families can also turn lesson reminders and announcements off for themselves in their own settings.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
