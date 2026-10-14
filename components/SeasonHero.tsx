import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AthleteAvatar from '@/components/AthleteAvatar';
import { GOLD } from '@/lib/colors';

/** Navy season header: athletes' photos, a title, a line, and an optional gold action. */
export default function SeasonHero({ athletes, title, subtitle, action }: {
  athletes: { id: string; first_name: string; photo_url?: string | null; avatar_color?: string | null }[];
  title: string; subtitle?: string;
  action?: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
}) {
  return (
    <View className="rounded-3xl p-5" style={{ backgroundColor: '#1E3A5F' }}>
      {athletes.length ? (
        <View className="flex-row mb-3">
          {athletes.map((a, i) => (
            <View key={a.id} style={{ marginLeft: i ? -10 : 0, borderWidth: 3, borderColor: '#1E3A5F', borderRadius: 999 }}>
              <AthleteAvatar athlete={a} size={44} />
            </View>
          ))}
        </View>
      ) : null}
      <Text className="text-2xl font-extrabold text-white font-nunito-extrabold">{title}</Text>
      {subtitle ? <Text className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>{subtitle}</Text> : null}
      {action ? (
        <Pressable onPress={action.onPress} className="flex-row items-center self-start rounded-full px-3.5 py-2 mt-4 active:opacity-80" style={{ backgroundColor: GOLD }} accessibilityLabel={action.label}>
          <Ionicons name={action.icon} size={14} color="#1E3A5F" />
          <Text className="text-xs font-extrabold ml-1.5" style={{ color: '#1E3A5F' }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
