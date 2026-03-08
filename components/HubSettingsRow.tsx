import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';

interface HubSettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle?: string;
  badge?: string | number;
  onPress: () => void;
}

export default function HubSettingsRow({ icon, iconColor, title, subtitle, badge, onPress }: HubSettingsRowProps) {
  const ic = useIconColors();

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
      onPress={onPress}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: `${iconColor}15` }}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View className="flex-1 mr-3">
        <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
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
