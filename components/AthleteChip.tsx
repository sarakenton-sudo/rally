import { View, Text, Pressable } from 'react-native';
import AthleteAvatar from '@/components/AthleteAvatar';

/** Filter chip; with an athlete it shows their photo and fills with their color when on. */
export default function AthleteChip({ label, on, color, onPress, athlete }: {
  label: string; on: boolean; color: string; onPress: () => void;
  athlete?: { first_name: string; photo_url?: string | null; avatar_color?: string | null };
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full mr-2 mb-2 border active:opacity-80"
      style={{ backgroundColor: on ? color : '#fff', borderColor: on ? color : '#D8E2EC', paddingLeft: athlete ? 3 : 12, paddingRight: 12, paddingVertical: athlete ? 3 : 7 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      {athlete ? <View className="mr-1.5"><AthleteAvatar athlete={athlete} size={26} /></View> : null}
      <Text className="text-xs font-bold" style={{ color: on ? '#fff' : '#1E3A5F' }}>{label}</Text>
    </Pressable>
  );
}
