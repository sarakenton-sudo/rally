import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';

interface HubSettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle?: string;
  badge?: string | number;
  comingSoon?: boolean;
  onPress: () => void;
}

export default function HubSettingsRow({ icon, iconColor, title, subtitle, badge, comingSoon, onPress }: HubSettingsRowProps) {
  const ic = useIconColors();

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, opacity: comingSoon ? 0.6 : 1 }}
      onPress={onPress}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: `${iconColor}15` }}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View className="flex-1 mr-3">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
          {comingSoon && (
            <View style={{ backgroundColor: 'rgba(251,146,60,0.25)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#FB923C', letterSpacing: 0.5 }}>COMING SOON</Text>
            </View>
          )}
        </View>
        {subtitle && <Text className="text-xs text-stone mt-0.5">{subtitle}</Text>}
      </View>
      {badge !== undefined && badge !== 0 && (
        <View className="bg-rally-600 px-2 py-0.5 rounded-full mr-2">
          <Text className="text-xs font-bold text-cream">{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
    </Pressable>
  );
}
