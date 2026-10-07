import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Section title with a colored accent bar and icon (parent Home, coach Today and Business). */
export default function SectionHeader({ icon, iconColor, title, subtitle, right }: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start mb-3">
      <View className="w-1 self-stretch rounded-full mr-3 mt-0.5" style={{ backgroundColor: iconColor }} />
      <View className="flex-row items-center mr-2 mt-0.5">
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-bark dark:text-cream">{title}</Text>
        {subtitle && (
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}
