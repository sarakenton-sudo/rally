import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FACILITY_STATUS_STYLE } from '@/lib/coach';
import { tapLight } from '@/lib/haptics';
import type { FacilityStatus } from '@/types/database';

const OPTIONS: { key: FacilityStatus; label: string }[] = [
  { key: 'reserved', label: 'Reserved' },
  { key: 'requested', label: 'Requested' },
  { key: 'not_booked', label: 'Not booked' },
];

/** Is the gym actually reserved for this block? (Never double-book a gym.) */
export default function FacilityStatusField({ value, onChange }: { value: FacilityStatus; onChange: (v: FacilityStatus) => void }) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Gym status</Text>
      <View className="flex-row">
        {OPTIONS.map((o) => {
          const on = value === o.key;
          const st = FACILITY_STATUS_STYLE[o.key];
          return (
            <Pressable
              key={o.key}
              onPress={() => { tapLight(); onChange(o.key); }}
              className="flex-1 flex-row items-center justify-center rounded-xl py-2.5 mr-2 border"
              style={{ backgroundColor: on ? st.color + '18' : 'transparent', borderColor: on ? st.color : '#D8E2EC' }}
            >
              <Ionicons name={st.icon} size={14} color={on ? st.color : '#8FA8BF'} />
              <Text className="text-xs font-semibold ml-1" style={{ color: on ? st.color : '#8FA8BF' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
