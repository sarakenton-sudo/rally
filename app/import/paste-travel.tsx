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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showError = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      setErrorMsg(msg);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      showError('Empty text', 'Paste a hotel or flight confirmation to extract travel details.');
      return;
    }

    setIsExtracting(true);
    setErrorMsg(null);

    try {
      let bookings;

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('extract-travel', {
          body: { text: trimmed },
        });

        if (error) throw new Error(error.message);
        bookings = data?.bookings;

        // If edge function returned nothing, fall back to local extraction
        if (!bookings || bookings.length === 0) {
          bookings = mockExtractTravel(trimmed);
        }
      } else {
        bookings = mockExtractTravel(trimmed);
      }

      if (!bookings || bookings.length === 0) {
        showError('No bookings found', 'Could not extract any travel details from the text. Try pasting a different format.');
        return;
      }

      router.push({
        pathname: '/import/review-travel',
        params: { bookings: JSON.stringify(bookings) },
      });
    } catch (err: any) {
      console.error('[paste-travel] Extraction error:', err);
      // Fall back to local extraction on edge function failure
      try {
        const bookings = mockExtractTravel(trimmed);
        if (bookings && bookings.length > 0) {
          router.push({
            pathname: '/import/review-travel',
            params: { bookings: JSON.stringify(bookings) },
          });
          return;
        }
      } catch {}
      showError('Extraction failed', err.message || 'Something went wrong. Please try again.');
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

          {/* Error message */}
          {errorMsg && (
            <View className="bg-red-50 rounded-xl p-4 mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 ml-2 flex-1">{errorMsg}</Text>
            </View>
          )}

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
 * Local extraction fallback.
 * Pattern matching for common airline/hotel confirmation formats.
 */
function mockExtractTravel(text: string) {
  const bookings: any[] = [];

  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04',
    june: '06', july: '07', august: '08', september: '09',
    october: '10', november: '11', december: '12',
  };

  // Detect airline from text
  const airlinePatterns: [RegExp, string][] = [
    [/delta/i, 'Delta'],
    [/southwest/i, 'Southwest'],
    [/united/i, 'United'],
    [/american\s*(?:airlines?)?/i, 'American'],
    [/jetblue/i, 'JetBlue'],
    [/spirit/i, 'Spirit'],
    [/frontier/i, 'Frontier'],
    [/alaska/i, 'Alaska'],
  ];

  // Try to detect flight bookings
  let detectedAirline = '';
  for (const [pattern, name] of airlinePatterns) {
    if (pattern.test(text)) { detectedAirline = name; break; }
  }

  if (detectedAirline || /flight|depart|arrive|seat/i.test(text)) {
    // Extract confirmation code — same line or next line
    const confirmMatch = text.match(/(?:confirmation|conf(?:irmation)?)[\s#:]*(?:number)?[\s#:]*([A-Z0-9]{5,8})/i)
      || text.match(/(?:confirmation|conf(?:irmation)?)[\s\S]*?\n\s*([A-Z0-9]{5,8})\s*\n/i);

    // Extract passenger name (stop at newline)
    const nameMatch = text.match(/(?:name|passenger)[:\s]*([A-Z][A-Z ]+[A-Z])/i);
    const travelerNames = nameMatch ? [nameMatch[1].trim().split(/\s+/).map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')] : [];

    // Extract dates — multiple formats
    // Format: "Thu, 19MAR" or "Mon, 23MAR"
    const dateLineMatches = [...text.matchAll(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*(\d{1,2})([A-Z]{3})/gi)];
    // Format: "March 19, 2026" or "Apr 3, 2026"
    const longDateMatches = [...text.matchAll(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/g)];
    // Format: "2026-03-19"
    const isoDateMatches = [...text.matchAll(/(\d{4}-\d{2}-\d{2})/g)];

    let departureDate = '';
    let returnDate = '';

    const currentYear = new Date().getFullYear();

    if (dateLineMatches.length >= 2) {
      // "19MAR" format
      const toISO = (day: string, mon: string) => {
        const m = monthMap[mon.toLowerCase()] || '01';
        return `${currentYear}-${m}-${day.padStart(2, '0')}`;
      };
      departureDate = toISO(dateLineMatches[0][1], dateLineMatches[0][2]);
      returnDate = toISO(dateLineMatches[dateLineMatches.length - 1][1], dateLineMatches[dateLineMatches.length - 1][2]);
    } else if (longDateMatches.length >= 2) {
      const toISO = (mon: string, day: string, year: string) => {
        const m = monthMap[mon.toLowerCase()] || '01';
        return `${year}-${m}-${day.padStart(2, '0')}`;
      };
      departureDate = toISO(longDateMatches[0][1], longDateMatches[0][2], longDateMatches[0][3]);
      returnDate = toISO(longDateMatches[longDateMatches.length - 1][1], longDateMatches[longDateMatches.length - 1][2], longDateMatches[longDateMatches.length - 1][3]);
    } else if (isoDateMatches.length >= 2) {
      departureDate = isoDateMatches[0][1];
      returnDate = isoDateMatches[isoDateMatches.length - 1][1];
    } else {
      // Try depart/return labels
      const dMatch = text.match(/depart[:\s]*(.+?)(?:\n|$)/i);
      const rMatch = text.match(/return[:\s]*(.+?)(?:\n|$)/i);
      if (dMatch) departureDate = dMatch[1].trim();
      if (rMatch) returnDate = rMatch[1].trim();
    }

    // Extract ticket/flight number
    const ticketMatch = text.match(/(?:ticket)[#:\s]*([A-Z0-9-]+)/i);

    bookings.push({
      type: 'flight',
      airline: detectedAirline || 'Other',
      confirmation_code: confirmMatch?.[1] || '',
      departure_date: departureDate,
      return_date: returnDate,
      ticket_number: ticketMatch?.[1] || '',
      booked_by: '',
      traveler_names: travelerNames,
      cost: null,
    });
  }

  // Try to detect hotel bookings
  const hotelPatterns: [RegExp, string][] = [
    [/marriott|bonvoy|courtyard|residence inn|westin|sheraton|w hotel/i, 'Bonvoy'],
    [/hilton|hampton|doubletree|embassy suites|waldorf/i, 'Direct'],
    [/hyatt/i, 'Direct'],
    [/booking\.com/i, 'Booking.com'],
    [/expedia/i, 'Expedia'],
  ];

  let detectedPlatform = 'Other';
  const hotelMatch = text.match(/(?:hotel|marriott|hilton|sheraton|hyatt|courtyard|residence inn|hampton|doubletree|westin|holiday inn|comfort inn|best western|la quinta)/i);

  if (hotelMatch || /check[- ]?in|check[- ]?out|reservation|arrival|departure/i.test(text)) {
    for (const [pattern, platform] of hotelPatterns) {
      if (pattern.test(text)) { detectedPlatform = platform; break; }
    }

    const confirmMatch = text.match(/(?:hotel\s+)?(?:confirmation|reservation|conf)(?:\s+number)?[#:\s]*([A-Z0-9-]+)/i);
    // Support check-in, arrival labels
    const checkInMatch = text.match(/(?:check[- ]?in|arrival)[:\s]*(.+?)(?:\n|$)/i);
    const checkOutMatch = text.match(/(?:check[- ]?out|departure)[:\s]*(.+?)(?:\n|$)/i);
    // Guest name: "Primary Guest Name: Adam Kenton" or "Guest: Sara Kenton"
    const guestMatch = text.match(/(?:primary\s+)?guest\s*name?[:\s]*(.+?)(?:\n|$)/i);
    // Room rate
    const rateMatch = text.match(/(?:room\s+)?rate[:\s]*\$?([\d,.]+)/i);

    // Hotel name: try "Hilton Minneapolis" style (brand name on its own line)
    let hotelName = '';
    const hotelNameMatch = text.match(/(?:hotel|resort|inn|suites|lodge)[:\s]*(.+?)(?:\n|$)/i);
    if (hotelNameMatch) {
      hotelName = hotelNameMatch[1].trim();
    }
    // Try brand + city on its own line (e.g. "Hilton Minneapolis")
    if (!hotelName) {
      const brandLineMatch = text.match(/^((?:Hilton|Marriott|Hyatt|Sheraton|Westin|Hampton|Courtyard|Residence Inn|DoubleTree|Embassy Suites|Holiday Inn|Comfort Inn|Best Western|La Quinta)\s+[\w\s]+?)$/im);
      if (brandLineMatch) hotelName = brandLineMatch[1].trim();
    }
    if (!hotelName && hotelMatch) hotelName = hotelMatch[0];

    // Parse MM/DD/YY or MM/DD/YYYY dates
    const parseHotelDate = (raw: string): string => {
      const trimmed = raw.trim();
      // MM/DD/YY or MM/DD/YYYY
      const slashMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (slashMatch) {
        let year = slashMatch[3];
        if (year.length === 2) year = '20' + year;
        return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
      }
      // Month Day, Year
      const longMatch = trimmed.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
      if (longMatch) {
        const m = monthMap[longMatch[1].toLowerCase()];
        if (m) return `${longMatch[3]}-${m}-${longMatch[2].padStart(2, '0')}`;
      }
      // ISO
      const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];
      return trimmed;
    };

    if (hotelMatch || checkInMatch) {
      bookings.push({
        type: 'hotel',
        hotel_name: hotelName,
        reservation_number: confirmMatch?.[1] || '',
        check_in: checkInMatch ? parseHotelDate(checkInMatch[1]) : '',
        check_out: checkOutMatch ? parseHotelDate(checkOutMatch[1]) : '',
        platform: detectedPlatform,
        booking_name: guestMatch?.[1]?.trim() || '',
        booked_by: '',
        cost: rateMatch ? parseFloat(rateMatch[1].replace(',', '')) : null,
      });
    }
  }

  return bookings;
}
