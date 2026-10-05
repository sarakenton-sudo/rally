import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tapLight } from '@/lib/haptics';
import type { Coach } from '@/types/database';
import type { CoachPolicies } from '@/lib/coach';

/**
 * "Get set up" — shown until the first four steps are done (then families can
 * book). Used on the coach Today and Business tabs.
 */
export default function SetupChecklist({ coach, typeCount, slotCount, policies }: {
  coach: Coach; typeCount: number | null; slotCount: number | null; policies: CoachPolicies | null;
}) {
  if (typeCount === null || slotCount === null) return null;
  const c = coach as any;
  const steps = [
    { done: !!(coach.photo_url && coach.bio), label: 'Photo and bio', path: '/coach/listing-edit' },
    { done: typeCount > 0, label: 'Session types and prices', path: '/coach/session-types' },
    { done: slotCount > 0, label: 'Your first week of availability', path: '/coach/availability-add' },
    { done: !!(policies?.reviewed && policies?.platform_agreement_accepted_at), label: 'Terms, release & platform agreement', path: '/coach/policies' },
    { done: !!c.stripe_charges_enabled, label: 'Get paid in the app (Stripe)', path: '/coach/payments' },
    { done: !!c.booking_page_published, label: 'Publish your booking page', path: '/coach/booking-page' },
  ];
  if (steps.slice(0, 4).every((x) => x.done)) return null;
  const doneCount = steps.filter((x) => x.done).length;
  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900 mb-4">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-bold text-bark dark:text-cream">Get set up</Text>
        <Text className="text-xs font-semibold text-stone">{doneCount} of {steps.length}</Text>
      </View>
      <Text className="text-xs text-stone dark:text-parchment mb-3">About 10 minutes. You can take requests as soon as the first four are done.</Text>
      {steps.map((st) => (
        <Pressable
          key={st.label}
          disabled={st.done}
          onPress={() => { tapLight(); router.push(st.path as any); }}
          className="flex-row items-center py-2 active:opacity-70"
        >
          <Ionicons name={st.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={st.done ? '#16a34a' : '#8FA8BF'} />
          <Text className={`text-sm ml-2.5 flex-1 ${st.done ? 'text-stone line-through' : 'text-bark dark:text-cream font-semibold'}`}>{st.label}</Text>
          {!st.done ? <Ionicons name="chevron-forward" size={16} color="#8FA8BF" /> : null}
        </Pressable>
      ))}
    </View>
  );
}
