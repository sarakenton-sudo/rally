import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';
import { extractTournamentDetails } from '@/lib/tournament-detail-parser';
import type { ExtractedTournamentDetails } from '@/lib/tournament-detail-parser';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export default function PasteTournamentDetailsScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();
  const ic = useIconColors();
  const [text, setText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('Paste a tournament info email or message to extract details.');
      return;
    }

    setIsExtracting(true);
    setErrorMsg(null);

    try {
      let details: ExtractedTournamentDetails | null = null;

      // Try AI extraction via edge function
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-tournament-details`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text: trimmed }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.details) details = data.details;
          }
        } catch (e) {
          console.warn('AI extraction failed, using local parser:', e);
        }
      }

      // Fallback to local extraction
      if (!details) {
        details = extractTournamentDetails(trimmed);
      }

      // Check if we got anything useful
      const hasContent = details.venue_name || details.venue_address || details.ticket_sales_date
        || details.ticket_link || details.schedule_link || details.notes;
      if (!hasContent) {
        setErrorMsg('Could not extract any tournament details from the text. Try pasting a different format.');
        return;
      }

      router.push({
        pathname: '/import/review-tournament-details',
        params: {
          details: JSON.stringify(details),
          ...(tournamentId ? { tournamentId } : {}),
        },
      });
    } catch (err: any) {
      // Fall back to local extraction on error
      try {
        const details = extractTournamentDetails(text.trim());
        const hasContent = details.venue_name || details.venue_address || details.ticket_sales_date
          || details.ticket_link || details.schedule_link || details.notes;
        if (hasContent) {
          router.push({
            pathname: '/import/review-tournament-details',
            params: {
              details: JSON.stringify(details),
              ...(tournamentId ? { tournamentId } : {}),
            },
          });
          return;
        }
      } catch {}
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark">
            Import Tournament Details
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 px-4 pt-4">
          {/* Instructions */}
          <View className="bg-rally-50 rounded-xl p-4 mb-4">
            <View className="flex-row items-start">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm text-rally-700 ml-2 flex-1">
                Paste a tournament info email or coach message. AI will extract venue, ticket info, schedule links, and more.
              </Text>
            </View>
          </View>

          {/* Error message */}
          {errorMsg && (
            <View className="bg-red-50 rounded-xl p-4 mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 ml-2 flex-1">{errorMsg}</Text>
            </View>
          )}

          {/* Text input */}
          <View className="flex-1 mb-4">
            <Text className="text-sm font-medium text-bark mb-2">
              Paste tournament info
            </Text>
            <TextInput
              className="flex-1 bg-cream rounded-xl p-4 text-sm text-bark border border-parchment"
              multiline
              textAlignVertical="top"
              placeholder="Paste a tournament email, info sheet, or coach message..."
              placeholderTextColor="#8FA8BF"
              value={text}
              onChangeText={setText}
            />
          </View>

          {/* Extract button */}
          <Pressable
            className={`rounded-xl py-4 items-center mb-6 ${
              isExtracting || !text.trim() ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'
            }`}
            onPress={handleExtract}
            disabled={isExtracting || !text.trim()}
          >
            {isExtracting ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#FEFEFE" />
                <Text className="text-sm font-semibold text-cream ml-2">Extracting...</Text>
              </View>
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="sparkles" size={18} color="#FEFEFE" />
                <Text className="text-sm font-semibold text-cream ml-2">Extract Details</Text>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
