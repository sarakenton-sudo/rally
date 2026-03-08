import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';

const EXAMPLE_TEXT = `Hotel Confirmation - Marriott Marquis Houston
Confirmation #: MQ8834721
Check-in: April 3, 2026
Check-out: April 5, 2026
Guest: Sara Kenton
Rate: $189/night

---

Flight Confirmation - Southwest Airlines
Confirmation: ATLALT
Passenger: Sara Kenton
Depart: April 3, 2026 - Austin (AUS) → Houston (IAH)
Return: April 5, 2026 - Houston (IAH) → Austin (AUS)`;

export default function PasteTravelScreen() {
  const ic = useIconColors();
  const [text, setText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Empty text', 'Paste a hotel or flight confirmation to extract travel details.');
      return;
    }

    setIsExtracting(true);

    try {
      let bookings;

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('extract-travel', {
          body: { text: trimmed },
        });

        if (error) throw new Error(error.message);
        bookings = data?.bookings;
      } else {
        // Mock extraction for dev mode
        bookings = mockExtractTravel(trimmed);
      }

      if (!bookings || bookings.length === 0) {
        Alert.alert('No bookings found', 'Could not extract any travel details from the text. Try pasting a different format.');
        return;
      }

      router.push({
        pathname: '/import/review-travel',
        params: { bookings: JSON.stringify(bookings) },
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
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">
            Import Travel Details
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 px-4 pt-4">
          {/* Instructions */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-4">
            <View className="flex-row items-start">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm text-rally-700 dark:text-rally-300 ml-2 flex-1">
                Paste any text containing travel details. AI will extract the details automatically.
              </Text>
            </View>
          </View>

          {/* Text input */}
          <View className="flex-1 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Paste travel confirmation
              </Text>
              <Pressable onPress={handlePasteExample} className="active:opacity-70">
                <Text className="text-xs text-rally-600 font-semibold">Try example</Text>
              </Pressable>
            </View>
            <TextInput
              className="flex-1 bg-cream dark:bg-bark-light rounded-xl p-4 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              multiline
              textAlignVertical="top"
              placeholder="Paste a hotel confirmation, flight confirmation, or booking email..."
              placeholderTextColor="#8FA8BF"
              value={text}
              onChangeText={setText}
            />
          </View>

          {/* Extract button */}
          <Pressable
            className={`rounded-xl py-4 items-center mb-6 ${
              isExtracting || !text.trim() ? 'bg-parchment dark:bg-rally-900' : 'bg-rally-600 active:opacity-80'
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
                <Text className="text-sm font-semibold text-cream ml-2">Extract Travel Details</Text>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Mock extraction for dev mode.
 * Simple pattern matching for demo purposes.
 */
function mockExtractTravel(text: string) {
  const bookings: any[] = [];
  const lower = text.toLowerCase();

  // Try to detect hotel bookings
  const hotelMatch = text.match(/(?:hotel|marriott|hilton|sheraton|hyatt|courtyard|residence inn)/i);
  const confirmMatch = text.match(/(?:confirmation|conf)[#:\s]*([A-Z0-9-]+)/i);
  const checkInMatch = text.match(/check[- ]?in[:\s]*(.+?)(?:\n|$)/i);
  const checkOutMatch = text.match(/check[- ]?out[:\s]*(.+?)(?:\n|$)/i);

  if (hotelMatch) {
    bookings.push({
      type: 'hotel',
      hotel_name: hotelMatch[0],
      reservation_number: confirmMatch?.[1] || '',
      check_in: checkInMatch?.[1]?.trim() || '',
      check_out: checkOutMatch?.[1]?.trim() || '',
      platform: 'Other',
      booking_name: '',
      booked_by: '',
      cost: null,
    });
  }

  // Try to detect flight bookings
  const flightMatch = text.match(/(?:flight|airline|delta|southwest|american|united|jetblue)/i);
  const flightConfirmMatch = text.match(/(?:confirmation|conf)[:\s]*([A-Z0-9]+)/i);
  const departMatch = text.match(/depart[:\s]*(.+?)(?:\n|$)/i);
  const returnMatch = text.match(/return[:\s]*(.+?)(?:\n|$)/i);

  if (flightMatch) {
    bookings.push({
      type: 'flight',
      airline: flightMatch[0],
      confirmation_code: flightConfirmMatch?.[1] || '',
      departure_date: departMatch?.[1]?.trim() || '',
      return_date: returnMatch?.[1]?.trim() || '',
      booked_by: '',
      traveler_names: [],
      cost: null,
    });
  }

  return bookings;
}
