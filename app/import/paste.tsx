import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { smartExtract } from '@/lib/schedule-parser';
import { extractTournamentDetails } from '@/lib/tournament-detail-parser';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const EXAMPLE_TEXT = `Hey parents! Here's our updated tournament schedule for the spring:

Lonestar Classic - January 17-19, 2026 - Dallas, TX - Dallas Convention Center
AJV Region Qualifier #1, Feb 7-8 2026 in San Antonio, TX
Triple Crown NIT  March 20-22, 2026  Denver, CO @ Colorado Convention Center
Show Me National Qualifier - April 17-19, 2026 - Kansas City, MO - KC Convention Center
USAV Junior Nationals  June 25-28, 2026  Indianapolis, IN  Indiana Convention Center

Let me know if you have any conflicts! -Coach Kim`;

/**
 * Detect if text is a detailed info email about a SINGLE tournament
 * (venue, ticket info, schedule, etc.) vs a LIST of multiple tournaments.
 */
function isDetailEmail(text: string): boolean {
  const lower = text.toLowerCase();
  // Signals of a detail/info email
  const detailSignals = [
    /ticket\s*(sales?|pricing|information)/i,
    /spectator/i,
    /check[- ]?in|warm[- ]?up/i,
    /division\s*(?:info|:)/i,
    /important\s+tournament\s+information/i,
    /schedule[:\s]*(?:posted|available|released)/i,
    /ticket\s*(?:sales?\s*)?(?:open|available)/i,
    /convention\s*center|arena|fieldhouse|complex/i,
    /\d{1,5}\s+\w+\s+(?:Ave|St|Blvd|Dr|Rd|Way|Pkwy)/i, // street address
    /refund\s*policy/i,
    /coaches?\s*(?:&|and)\s*players?/i,
  ];
  const detailCount = detailSignals.filter((r) => r.test(text)).length;

  // If 3+ detail signals, it's a detail email
  if (detailCount >= 3) return true;

  // Also check: if smartExtract only finds 0-1 tournaments but the text is long, it's probably detail
  const tournaments = smartExtract(text);
  if (text.length > 500 && tournaments.length <= 1 && detailCount >= 2) return true;

  return false;
}

export default function PasteImportScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();
  const ic = useIconColors();
  const [text, setText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('Paste a schedule, coach message, or email to extract tournaments.');
      return;
    }

    setErrorMsg('');
    setIsExtracting(true);

    try {
      // Check if this is a single-tournament detail email
      if (isDetailEmail(trimmed)) {
        let details = null;

        // Try AI extraction
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
            console.warn('AI detail extraction failed:', e);
          }
        }

        // Fallback to local
        if (!details) {
          details = extractTournamentDetails(trimmed);
        }

        const hasContent = details && (details.venue_name || details.venue_address ||
          details.ticket_sales_date || details.ticket_link || details.schedule_link || details.notes);

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
      }

      // Regular flow: extract tournament list
      let tournaments;

      // Try AI extraction via edge function first
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-schedule`, {
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
          const data = await resp.json();
          if (resp.ok && data.tournaments && data.tournaments.length > 0) {
            tournaments = data.tournaments;
          } else if (data.error) {
            console.warn('AI extraction error:', data.error);
          }
        } catch (e) {
          console.warn('AI extraction failed, using local parser:', e);
        }
      }

      // Fallback to smart local parser
      if (!tournaments || tournaments.length === 0) {
        tournaments = smartExtract(trimmed);
      }

      if (!tournaments || tournaments.length === 0) {
        setErrorMsg('Could not extract any tournament details from the text. Try pasting a different format.');
        return;
      }

      router.push({
        pathname: '/import/review',
        params: { tournaments: JSON.stringify(tournaments) },
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePasteExample = () => {
    setText(EXAMPLE_TEXT);
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
            Import Schedule
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 px-4 pt-4">
          {/* Instructions */}
          <View className="bg-rally-50 rounded-xl p-4 mb-4">
            <View className="flex-row items-start">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm text-rally-700 ml-2 flex-1">
                Paste any text — a tournament schedule list, info email, or coach message. We'll extract tournaments, venue, tickets, schedule links, and more.
              </Text>
            </View>
          </View>

          {/* Error message */}
          {errorMsg ? (
            <View className="bg-red-50 rounded-xl p-3 mb-3">
              <Text className="text-sm text-red-600 font-semibold text-center">{errorMsg}</Text>
            </View>
          ) : null}

          {/* Text input */}
          <View className="flex-1 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-bark">
                Paste schedule or tournament info
              </Text>
              <Pressable onPress={handlePasteExample} className="active:opacity-70">
                <Text className="text-xs text-rally-600 font-semibold">Try example</Text>
              </Pressable>
            </View>
            <TextInput
              className="flex-1 bg-cream rounded-xl p-4 text-sm text-bark border border-parchment"
              multiline
              textAlignVertical="top"
              placeholder="Paste a coach message, tournament info email, or schedule here..."
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
