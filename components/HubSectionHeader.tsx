import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HubSectionHeaderProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  iconColor?: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export default function HubSectionHeader({ icon, title, iconColor = '#8FA8BF', subtitle, action }: HubSectionHeaderProps) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Ionicons name={icon} size={16} color={iconColor} />
          <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
            {title}
          </Text>
        </View>
        {action && (
          <Pressable
            className="flex-row items-center active:opacity-70"
            onPress={action.onPress}
          >
            <Ionicons name="add-circle-outline" size={18} color="#3B82B0" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">{action.label}</Text>
          </Pressable>
        )}
      </View>
      {subtitle && (
        <Text className="text-xs text-stone dark:text-parchment mt-1 ml-0.5">
          {subtitle}
        </Text>
      )}
    </View>
  );
}
