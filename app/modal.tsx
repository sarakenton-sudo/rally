import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text } from 'react-native';

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-warm-white dark:bg-bark">
      <Text className="text-xl font-bold text-bark dark:text-cream">
        Settings
      </Text>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}
