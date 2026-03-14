import { View, Text } from 'react-native';

interface HubScopeDividerProps {
  scope: string;
  label: string;
  hidden?: boolean;
}

export default function HubScopeDivider({ scope, label, hidden }: HubScopeDividerProps) {
  if (hidden) return null;

  return (
    <View className="flex-row items-center mt-8 mb-4">
      <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
      <Text className="text-xs font-semibold text-stone dark:text-parchment mx-3 uppercase tracking-widest">
        {scope} · {label}
      </Text>
      <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
    </View>
  );
}
