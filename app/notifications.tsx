import { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationProvider';
import { useGuestStore } from '@/stores/useGuestStore';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';

interface NotificationLogEntry {
  id: string;
  guest_id: string | null;
  tournament_id: string | null;
  notification_type: string;
  channel: string;
  message: string;
  sent_at: string;
  status: string;
}

const TYPE_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  tournament_reminder: { icon: 'calendar', color: '#C4714A', label: 'Reminder' },
  rsvp_request: { icon: 'mail', color: '#7c3aed', label: 'RSVP' },
  cancellation_deadline: { icon: 'warning', color: '#dc2626', label: 'Deadline' },
  schedule_change: { icon: 'swap-horizontal', color: '#d97706', label: 'Schedule' },
  custom: { icon: 'notifications', color: '#9E8E7E', label: 'Custom' },
};

const CHANNEL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  push: 'phone-portrait-outline',
  sms: 'chatbubble-outline',
  email: 'mail-outline',
};

export default function NotificationsScreen() {
  const ic = useIconColors();
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { notifications: localNotifications } = useNotifications();
  const guests = useGuestStore((s) => s.guests);
  const tournaments = useSeasonStore((s) => s.tournaments);

  useEffect(() => {
    if (isSupabaseConfigured && user) {
      fetchLogs();
    } else {
      const mockLogs: NotificationLogEntry[] = localNotifications.map((n, i) => ({
        id: `local-${i}`,
        guest_id: null,
        tournament_id: (n.request.content.data?.tournamentId as string) ?? null,
        notification_type: 'custom',
        channel: 'push',
        message: n.request.content.body ?? '',
        sent_at: new Date(n.date).toISOString(),
        status: 'delivered',
      }));
      setLogs(mockLogs);
      setIsLoading(false);
    }
  }, [user, localNotifications.length]);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notification_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setLogs(data as NotificationLogEntry[]);
    }
    setIsLoading(false);
  };

  const getGuestName = (guestId: string | null) => {
    if (!guestId) return null;
    return guests.find((g) => g.id === guestId)?.name ?? 'Unknown guest';
  };

  const getTournamentName = (tournamentId: string | null) => {
    if (!tournamentId) return null;
    return tournaments.find((t) => t.id === tournamentId)?.name ?? 'Unknown';
  };

  const renderItem = ({ item }: { item: NotificationLogEntry }) => {
    const typeConfig = TYPE_CONFIG[item.notification_type] ?? TYPE_CONFIG.custom;
    const guestName = getGuestName(item.guest_id);
    const tournamentName = getTournamentName(item.tournament_id);
    const sentDate = new Date(item.sent_at);

    return (
      <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900">
        <View className="flex-row items-start">
          {/* Type icon */}
          <View
            className="w-9 h-9 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${typeConfig.color}15` }}
          >
            <Ionicons name={typeConfig.icon} size={18} color={typeConfig.color} />
          </View>

          <View className="flex-1">
            {/* Header row */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Text className="text-sm font-semibold text-bark dark:text-cream">
                  {typeConfig.label}
                </Text>
                <View className="flex-row items-center ml-2">
                  <Ionicons
                    name={CHANNEL_ICON[item.channel] ?? 'notifications-outline'}
                    size={12}
                    color="#9E8E7E"
                  />
                  <Text className="text-xs text-stone ml-0.5 uppercase">{item.channel}</Text>
                </View>
              </View>
              <View className={`px-2 py-0.5 rounded-full ${
                item.status === 'sent' || item.status === 'delivered' ? 'bg-green-100' :
                item.status === 'failed' || item.status === 'bounced' ? 'bg-red-100' : 'bg-cream'
              }`}>
                <Text className={`text-xs font-medium ${
                  item.status === 'sent' || item.status === 'delivered' ? 'text-green-700' :
                  item.status === 'failed' || item.status === 'bounced' ? 'text-red-600' : 'text-stone'
                }`}>
                  {item.status}
                </Text>
              </View>
            </View>

            {/* Message */}
            <Text className="text-sm text-stone dark:text-parchment mt-1" numberOfLines={2}>
              {item.message}
            </Text>

            {/* Meta row */}
            <View className="flex-row items-center mt-2 gap-3">
              {guestName && (
                <View className="flex-row items-center">
                  <Ionicons name="person-outline" size={12} color="#9E8E7E" />
                  <Text className="text-xs text-stone ml-1">{guestName}</Text>
                </View>
              )}
              {tournamentName && (
                <View className="flex-row items-center">
                  <Ionicons name="trophy-outline" size={12} color="#9E8E7E" />
                  <Text className="text-xs text-stone ml-1">{tournamentName}</Text>
                </View>
              )}
              <Text className="text-xs text-parchment">
                {sentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' '}
                {sentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-warm-white dark:bg-bark border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream flex-1">
          Notifications
        </Text>
        <View className="flex-row items-center">
          {isSupabaseConfigured && (
            <Pressable onPress={fetchLogs} className="p-1 mr-2">
              <Ionicons name="refresh" size={20} color={ic.muted} />
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/settings/notifications')} className="p-1">
            <Ionicons name="settings-outline" size={20} color={ic.muted} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#C4714A" />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <Ionicons name="notifications-off-outline" size={48} color={ic.placeholder} />
              <Text className="text-lg font-semibold text-stone mt-4">No notifications yet</Text>
              <Text className="text-sm text-stone mt-1 text-center px-8">
                Notifications will appear here when you send RSVP requests, reminders, or deadline alerts.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
