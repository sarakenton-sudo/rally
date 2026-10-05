import { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, Platform, Linking } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/providers/AuthProvider';

/** Fan settings: game-day alerts, sign out, delete account. */
export default function FanSettings() {
  const { user, signOut } = useAuth();
  const [push, setPush] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then((r) => setPush(r.status === 'granted'));
  }, []);

  const togglePush = async (v: boolean) => {
    if (!v) { Linking.openSettings(); return; } // iOS only lets the person turn it off in Settings
    const r = await Notifications.requestPermissionsAsync();
    if (r.status !== 'granted') Linking.openSettings();
    setPush(r.status === 'granted');
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <View className="p-4">
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold mb-4">Settings</Text>
        <Text className="text-xs text-stone dark:text-parchment mb-4">Signed in as {user?.email}</Text>

        {Platform.OS !== 'web' && (
          <View className="bg-warm-white dark:bg-bark-light rounded-xl px-4 py-3 mb-3 flex-row items-center border border-parchment dark:border-rally-900">
            <View className="flex-1 mr-3">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Game-day alerts</Text>
              <Text className="text-xs text-stone mt-0.5">A heads-up the morning of each tournament, and when plans change.</Text>
            </View>
            <Switch value={!!push} onValueChange={togglePush} trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }} thumbColor={push ? '#3B82B0' : '#FEFEFE'} />
          </View>
        )}

        <Pressable onPress={() => signOut()} className="bg-red-50 dark:bg-red-900/20 rounded-xl py-3.5 items-center mt-4 border border-red-200 dark:border-red-800 active:opacity-80">
          <Text className="text-sm font-semibold text-red-600">Sign Out</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/settings/account')} className="items-center py-4">
          <Text className="text-xs font-semibold text-stone underline">Delete my account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
