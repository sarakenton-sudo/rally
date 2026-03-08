import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';

const CLASS_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  stay_and_play: { icon: 'bed', color: '#7c3aed', label: 'Hotel / Stay & Play' },
  travel_confirmation: { icon: 'airplane', color: '#2563eb', label: 'Travel Confirmation' },
  coach_announcement: { icon: 'megaphone', color: '#d97706', label: 'Coach Announcement' },
  schedule_change: { icon: 'swap-horizontal', color: '#dc2626', label: 'Schedule Change' },
  tournament_info: { icon: 'trophy', color: '#16a34a', label: 'Tournament Info' },
  other: { icon: 'mail', color: '#6b7280', label: 'Other' },
};

export default function EmailDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const email = useSeasonStore((s) => s.forwardedEmails.find((e) => e.id === id));
  const { user } = useAuth();

  if (!email) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-900 items-center justify-center">
        <Text className="text-lg text-gray-500">Email not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-rally-600 font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cls = CLASS_CONFIG[email.classification] ?? CLASS_CONFIG.other;
  const receivedDate = new Date(email.received_at);

  const handleExtractSchedule = async () => {
    // Send email body to extract-schedule Edge Function, reuse review flow
    if (isSupabaseConfigured && user) {
      try {
        const { data, error } = await supabase.functions.invoke('extract-schedule', {
          body: { text: `Subject: ${email.subject}\n\n${email.body_text}` },
        });

        if (error) throw new Error(error.message);

        const tournaments = data?.tournaments;
        if (!tournaments || tournaments.length === 0) {
          Alert.alert('No tournaments found', 'Could not extract tournament details from this email.');
          return;
        }

        router.push({
          pathname: '/import/review',
          params: { tournaments: JSON.stringify(tournaments) },
        });
      } catch (err: any) {
        Alert.alert('Extraction failed', err.message);
      }
    } else {
      // Dev mode: navigate with email body to paste review
      router.push({
        pathname: '/import/paste',
      });
    }
  };

  const handleCreateBooking = () => {
    // Pre-fill hotel booking from email context
    router.push({
      pathname: '/booking/add-hotel',
      params: { emailSubject: email.subject },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white flex-1" numberOfLines={1}>
          Email Detail
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Classification banner */}
        <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
          <Ionicons name={cls.icon} size={24} color={cls.color} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-gray-900 dark:text-white">{cls.label}</Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              AI classified • {receivedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* Email metadata */}
        <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
          <View className="mb-3">
            <Text className="text-xs text-gray-400 uppercase tracking-wider">From</Text>
            <Text className="text-sm text-gray-900 dark:text-white mt-0.5">{email.from_address}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-xs text-gray-400 uppercase tracking-wider">Subject</Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{email.subject}</Text>
          </View>
          <View>
            <Text className="text-xs text-gray-400 uppercase tracking-wider">Received</Text>
            <Text className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
              {receivedDate.toLocaleString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Email body */}
        <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4 border border-gray-100 dark:border-gray-700">
          <Text className="text-xs text-gray-400 uppercase tracking-wider mb-2">Body</Text>
          <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">
            {email.body_text}
          </Text>
        </View>

        {/* Action buttons based on classification */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">
          Actions
        </Text>

        {(email.classification === 'tournament_info' ||
          email.classification === 'schedule_change' ||
          email.classification === 'coach_announcement') && (
          <Pressable
            className="bg-rally-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
            onPress={handleExtractSchedule}
          >
            <Ionicons name="sparkles" size={18} color="white" />
            <Text className="text-sm font-semibold text-white ml-2">Extract Tournaments</Text>
          </Pressable>
        )}

        {(email.classification === 'stay_and_play' ||
          email.classification === 'travel_confirmation') && (
          <Pressable
            className="bg-purple-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
            onPress={handleCreateBooking}
          >
            <Ionicons name="bed" size={18} color="white" />
            <Text className="text-sm font-semibold text-white ml-2">Create Booking</Text>
          </Pressable>
        )}

        <Pressable
          className="bg-white dark:bg-gray-800 rounded-xl py-3.5 items-center flex-row justify-center border border-gray-200 dark:border-gray-700 active:opacity-80"
          onPress={handleExtractSchedule}
        >
          <Ionicons name="search" size={18} color={ic.muted} />
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300 ml-2">
            Re-extract with AI
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
