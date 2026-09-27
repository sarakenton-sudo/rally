import { View, Text } from 'react-native';
import { fmtMoney, type WeekSummary } from '@/lib/coach';

/**
 * "Money is the home screen": Booked / Pending / Collected / Outstanding for the
 * week, plus open revenue, full-book potential and utilization.
 */
export default function WeekSummaryHeader({ s }: { s: WeekSummary }) {
  const tiles = [
    { label: 'Booked', value: s.booked, color: '#1E3A5F', hint: `${s.lessons} lesson${s.lessons === 1 ? '' : 's'}` },
    { label: 'Pending', value: s.pending, color: '#b45309', hint: 'awaiting you' },
    { label: 'Collected', value: s.collected, color: '#16a34a', hint: 'paid' },
    { label: 'Outstanding', value: s.outstanding, color: s.outstanding ? '#dc2626' : '#8FA8BF', hint: 'not yet paid' },
  ];
  return (
    <View className="mb-3">
      <View className="flex-row flex-wrap -mx-1">
        {tiles.map((t) => (
          <View key={t.label} style={{ width: '50%' }} className="px-1 mb-2">
            <View className="bg-warm-white dark:bg-bark-light rounded-xl px-3 py-2.5 border border-parchment dark:border-rally-900">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone">{t.label}</Text>
              <Text className="text-xl font-bold mt-0.5" style={{ color: t.color }}>{fmtMoney(t.value)}</Text>
              <Text className="text-[11px] text-stone dark:text-parchment">{t.hint}</Text>
            </View>
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-between bg-rally-50 dark:bg-rally-900/20 rounded-xl px-3 py-2.5">
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone">Still open</Text>
          <Text className="text-base font-bold text-rally-600">{fmtMoney(s.open)}</Text>
        </View>
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone">Full book</Text>
          <Text className="text-base font-bold text-bark dark:text-cream">{fmtMoney(s.fullBook)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone">Utilization</Text>
          <Text className="text-base font-bold text-bark dark:text-cream">
            {s.utilization === null ? '—' : `${s.utilization}%`}
          </Text>
        </View>
      </View>
      {s.utilization !== null && (
        <View className="h-1.5 rounded-full bg-parchment dark:bg-rally-900 mt-2 overflow-hidden">
          <View className="h-1.5 rounded-full" style={{ width: `${s.utilization}%`, backgroundColor: '#3B82B0' }} />
        </View>
      )}
    </View>
  );
}
