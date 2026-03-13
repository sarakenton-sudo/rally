import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { NotificationPreferences } from '@/types/database';

const PREF_ROWS: { key: keyof NotificationPreferences; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tournament_reminders', label: 'Tournament Reminders', description: 'Countdown alerts before each tournament', icon: 'calendar' },
  { key: 'cancellation_deadlines', label: 'Cancellation Deadlines', description: 'Alerts when hotel cancellation dates approach', icon: 'warning' },
  { key: 'email_arrivals', label: 'VIP Email Arrivals', description: 'Notify when VIP sender emails are forwarded', icon: 'mail' },
  { key: 'rsvp_responses', label: 'RSVP Responses', description: 'Notify when guests respond to RSVP requests', icon: 'people' },
  { key: 'schedule_changes', label: 'Schedule Changes', description: 'Alerts when tournament schedules are updated', icon: 'swap-horizontal' },
];

export default function NotificationPreferencesScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { user } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const defaultPrefs: NotificationPreferences = {
    tournament_reminders: true,
    cancellation_deadlines: true,
    email_arrivals: true,
    rsvp_responses: true,
    schedule_changes: true,
  };

  const [prefs, setPrefs] = useState<NotificationPreferences>(
    adminConfig?.notification_preferences ?? defaultPrefs
  );
  const [isSaving, setIsSaving] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);

  // Check push permission on mount
  useState(() => {
    Notifications.getPermissionsAsync().then((result) => {
      setPermissionStatus(result.status);
    });
  });

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Push notifications are disabled. Please enable them in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!adminConfig) return;
    setIsSaving(true);

    const updates = { notification_preferences: prefs };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateAdminConfig(adminConfig.id, updates);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      setAdminConfig({ ...adminConfig, ...updates });
      notifySuccess();
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">
          Notification Settings
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
        >
          <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
        {/* Push permission banner */}
        {permissionStatus && permissionStatus !== 'granted' && (
          <Pressable
            className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mb-6 flex-row items-center active:opacity-80"
            onPress={requestPermission}
          >
            <Ionicons name="notifications-off" size={22} color="#d97706" />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Push notifications disabled
              </Text>
              <Text className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                Tap to enable push notifications
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d97706" />
          </Pressable>
        )}

        {permissionStatus === 'granted' && (
          <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6 flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text className="text-sm text-green-700 dark:text-green-300 ml-2">
              Push notifications enabled
            </Text>
          </View>
        )}

        {/* Toggle rows */}
        {PREF_ROWS.map((row) => (
          <View
            key={row.key}
            className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-2 flex-row items-center"
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#3B82B015' }}
            >
              <Ionicons name={row.icon} size={18} color="#3B82B0" />
            </View>
            <View className="flex-1 mr-3">
              <Text className="text-sm font-medium text-bark dark:text-cream">{row.label}</Text>
              <Text className="text-xs text-stone mt-0.5">{row.description}</Text>
            </View>
            <Switch
              value={prefs[row.key]}
              onValueChange={() => togglePref(row.key)}
              trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
              thumbColor={prefs[row.key] ? '#3B82B0' : '#FEFEFE'}
            />
          </View>
        ))}

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
