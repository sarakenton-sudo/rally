import { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { PAYMENTS_ENABLED } from '@/lib/config';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tapLight } from '@/lib/haptics';
import type { Coach } from '@/types/database';
import { CORAL, CORAL_TINT, GOLD } from '@/lib/colors';
import { fetchFacilities, type CoachPolicies } from '@/lib/coach';

/**
 * "Get set up" — shown until the first five steps are done (then families can
 * book). Used on the coach Today and Business tabs.
 */
export default function SetupChecklist({ coach, typeCount, slotCount, policies }: {
  coach: Coach; typeCount: number | null; slotCount: number | null; policies: CoachPolicies | null;
}) {
  const [facilityCount, setFacilityCount] = useState<number | null>(null);
  useFocusEffect(useCallback(() => { fetchFacilities(coach.id).then(({ data }) => setFacilityCount(data.length)); }, [coach.id]));
  if (typeCount === null || slotCount === null || facilityCount === null) return null;
  const c = coach as any;
  const steps = [
    { done: !!(coach.photo_url && coach.bio), label: 'Photo and bio', path: '/coach/listing-edit' },
    { done: facilityCount > 0, label: 'Where you coach (gym or facility)', path: '/coach/facilities' },
    { done: typeCount > 0, label: 'Session types and prices', path: '/coach/session-types' },
    { done: slotCount > 0, label: 'Your first week of availability', path: '/coach/availability-add' },
    { done: !!(policies?.reviewed && policies?.platform_agreement_accepted_at), label: 'Terms, release & platform agreement', path: '/coach/policies' },
    ...(PAYMENTS_ENABLED ? [{ done: !!c.stripe_charges_enabled, label: 'Get paid in the app (Stripe)', path: '/coach/payments' }] : []),
    { done: !!c.booking_page_published, label: 'Publish your booking page', path: '/coach/booking-page' },
  ];
  if (steps.slice(0, 5).every((x) => x.done)) return null;
  const doneCount = steps.filter((x) => x.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border mb-4" style={{ borderColor: CORAL + '55' }}>
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <Ionicons name="rocket" size={16} color={CORAL} />
          <Text className="text-base font-bold text-bark dark:text-cream ml-1.5">Get set up</Text>
        </View>
        <Text className="text-xs font-bold" style={{ color: CORAL }}>{doneCount} of {steps.length}</Text>
      </View>
      <View className="h-2 rounded-full mt-1.5 mb-2 overflow-hidden" style={{ backgroundColor: CORAL_TINT }}>
        <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: GOLD }} />
      </View>
      <Text className="text-xs text-stone dark:text-parchment mb-2">About 10 minutes. You can take requests as soon as the first five are done.</Text>
      {steps.map((st, i) => {
        const nextUp = !st.done && steps.findIndex((x) => !x.done) === i;
        return (
          <Pressable
            key={st.label}
            disabled={st.done}
            onPress={() => { tapLight(); router.push(st.path as any); }}
            className="flex-row items-center py-2 px-2 -mx-2 rounded-lg active:opacity-70"
            style={nextUp ? { backgroundColor: CORAL_TINT } : undefined}
          >
            <Ionicons name={st.done ? 'checkmark-circle' : nextUp ? 'arrow-forward-circle' : 'ellipse-outline'} size={20} color={st.done ? '#16a34a' : nextUp ? CORAL : '#8FA8BF'} />
            <Text className={`text-sm ml-2.5 flex-1 ${st.done ? 'text-stone line-through' : 'text-bark dark:text-cream font-semibold'}`}>{st.label}</Text>
            {!st.done ? <Ionicons name="chevron-forward" size={16} color={nextUp ? CORAL : '#8FA8BF'} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
