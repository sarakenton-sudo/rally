import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';

const EXAMPLE_TEXT = `AJV 14u Travel 2025-2026 Schedule:

1. Lonestar Classic - Jan 17-19, 2026 - Dallas, TX - Dallas Convention Center
2. AJV Region Qualifier #1 - Feb 7-8, 2026 - San Antonio, TX
3. Triple Crown NIT - Mar 20-22, 2026 - Denver, CO - Colorado Convention Center`;

export default function PasteImportScreen() {
  const ic = useIconColors();
  const [text, setText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Empty text', 'Paste a schedule, coach message, or email to extract tournaments.');
      return;
    }

    setIsExtracting(true);

    try {
      let tournaments;

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('extract-schedule', {
          body: { text: trimmed },
        });

        if (error) throw new Error(error.message);
        tournaments = data?.tournaments;
      } else {
        // Mock extraction for dev mode
        tournaments = mockExtract(trimmed);
      }

      if (!tournaments || tournaments.length === 0) {
        Alert.alert('No tournaments found', 'Could not extract any tournament details from the text. Try pasting a different format.');
        return;
      }

      // Navigate to review screen with extracted data
      router.push({
        pathname: '/import/review',
        params: { tournaments: JSON.stringify(tournaments) },
      });
    } catch (err: any) {
      Alert.alert('Extraction failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePasteExample = () => {
    setText(EXAMPLE_TEXT);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Import Schedule
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 px-4 pt-4">
          {/* Instructions */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-4">
            <View className="flex-row items-start">
              <Ionicons name="sparkles" size={18} color="#2563eb" />
              <Text className="text-sm text-rally-700 dark:text-rally-300 ml-2 flex-1">
                Paste any text containing tournament info — a coach's GroupMe message, forwarded email, or schedule list. AI will extract the details automatically.
              </Text>
            </View>
          </View>

          {/* Text input */}
          <View className="flex-1 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Paste schedule text
              </Text>
              <Pressable onPress={handlePasteExample} className="active:opacity-70">
                <Text className="text-xs text-rally-600 font-semibold">Try example</Text>
              </Pressable>
            </View>
            <TextInput
              className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
              multiline
              textAlignVertical="top"
              placeholder="Paste a coach message, email, or schedule here..."
              placeholderTextColor="#9ca3af"
              value={text}
              onChangeText={setText}
            />
          </View>

          {/* Extract button */}
          <Pressable
            className={`rounded-xl py-4 items-center mb-6 ${
              isExtracting || !text.trim() ? 'bg-gray-300 dark:bg-gray-700' : 'bg-rally-600 active:opacity-80'
            }`}
            onPress={handleExtract}
            disabled={isExtracting || !text.trim()}
          >
            {isExtracting ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-sm font-semibold text-white ml-2">Extracting...</Text>
              </View>
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="sparkles" size={18} color="white" />
                <Text className="text-sm font-semibold text-white ml-2">Extract Tournaments</Text>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Mock extraction for dev mode (no Supabase/Claude API).
 * Does simple line-by-line parsing for demo purposes.
 */
function mockExtract(text: string) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const tournaments: any[] = [];

  for (const line of lines) {
    // Try to match patterns like "Name - Date - City" or "Name, Date, City"
    const dateMatch = line.match(
      /([A-Z][a-z]+ \d{1,2}(?:-\d{1,2})?(?:,?\s*\d{4})?)/
    );
    if (!dateMatch) continue;

    const parts = line.split(/\s*[-–]\s*/);
    if (parts.length < 2) continue;

    // Clean leading numbers/bullets
    const name = parts[0].replace(/^\d+[\.\)]\s*/, '').trim();
    const dateStr = parts[1]?.trim() || '';
    const city = parts[2]?.trim() || '';
    const venue = parts[3]?.trim() || '';

    // Parse date range
    const monthDayMatch = dateStr.match(
      /([A-Z][a-z]+)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,?\s*(\d{4})?/
    );
    if (!monthDayMatch) continue;

    const monthStr = monthDayMatch[1];
    const startDay = parseInt(monthDayMatch[2]);
    const endDay = monthDayMatch[3] ? parseInt(monthDayMatch[3]) : startDay;
    const year = monthDayMatch[4] || '2026';

    const monthMap: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    const month = monthMap[monthStr] || '01';

    tournaments.push({
      name,
      start_date: `${year}-${month}-${String(startDay).padStart(2, '0')}`,
      end_date: `${year}-${month}-${String(endDay).padStart(2, '0')}`,
      location_city: city,
      venue_name: venue,
      venue_address: '',
      notes: '',
    });
  }

  return tournaments;
}
