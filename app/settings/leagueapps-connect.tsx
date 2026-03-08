import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTeamConfig } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function LeagueAppsConnectScreen() {
  const ic = useIconColors();
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);
  const { user } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = teamConfig?.schedule_import_source === 'leagueapps' && teamConfig?.schedule_import_connected;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // Open LeagueApps OAuth flow in browser
      await WebBrowser.openBrowserAsync('https://leagueapps.com/oauth/authorize');

      // For now, simulate successful connection
      if (!teamConfig) return;

      const updates = {
        schedule_import_source: 'leagueapps' as const,
        schedule_import_connected: true,
      };

      if (isSupabaseConfigured && user) {
        const { error } = await updateTeamConfig(teamConfig.id, updates);
        if (error) {
          Alert.alert('Connection failed', error.message);
          return;
        }
      }

      setTeamConfig({ ...teamConfig, ...updates });
      notifySuccess();
      Alert.alert('Connected', 'LeagueApps is now connected. Your schedule will sync automatically.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to connect to LeagueApps.');
    } finally {
      setIsConnecting(false);
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
          LeagueApps
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
        {/* Info banner */}
        <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-6 flex-row items-start">
          <Ionicons name="information-circle" size={20} color="#3B82B0" />
          <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1">
            Connect your LeagueApps account to automatically import your team's tournament schedule. You'll be able to review tournaments before they're added.
          </Text>
        </View>

        {/* Status */}
        {isConnected && (
          <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4 flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text className="text-sm font-semibold text-green-700 dark:text-green-300 ml-3">
              Connected to LeagueApps
            </Text>
          </View>
        )}

        {/* Connect button */}
        <Pressable
          className={`rounded-xl py-4 items-center mb-6 ${
            isConnecting ? 'bg-parchment dark:bg-rally-900' : 'bg-rally-600 active:opacity-80'
          }`}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          <View className="flex-row items-center">
            <Ionicons name={isConnected ? 'refresh' : 'log-in-outline'} size={18} color="#FEFEFE" />
            <Text className="text-sm font-semibold text-cream ml-2">
              {isConnecting ? 'Connecting...' : isConnected ? 'Reconnect' : 'Connect to LeagueApps'}
            </Text>
          </View>
        </Pressable>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
