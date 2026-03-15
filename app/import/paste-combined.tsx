import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { extractTournamentDetails } from '@/lib/tournament-detail-parser';
import { smartExtract } from '@/lib/schedule-parser';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export default function PasteCombinedScreen() {
  const ic = useIconColors();
  const [text, setText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExtract = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('Paste something to extract.');
      return;
    }

    setIsExtracting(true);
    setErrorMsg(null);

    try {
      // Try schedule parser FIRST — fast, handles simple tournament lists
      const scheduleTournaments = smartExtract(trimmed);
      if (scheduleTournaments.length > 0) {
        router.push({
          pathname: '/import/review',
          params: { tournaments: JSON.stringify(scheduleTournaments) },
        });
        return;
      }

      // Try unified AI extraction
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 45000);
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-all`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text: trimmed.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\r\t]/gu, '').slice(0, 8000) }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (resp.ok) {
            const data = await resp.json();
            const hasTravel = data?.travel?.bookings?.length > 0;
            const hasDetails = data?.tournament_details?.details &&
              Object.values(data.tournament_details.details).some((v: any) => v && v.length > 0);

            if (hasTravel && hasDetails) {
              router.push({
                pathname: '/import/review-travel',
                params: {
                  bookings: JSON.stringify(data.travel.bookings),
                  pendingDetails: JSON.stringify(data.tournament_details.details),
                },
              });
              return;
            } else if (hasTravel) {
              router.push({
                pathname: '/import/review-travel',
                params: { bookings: JSON.stringify(data.travel.bookings) },
              });
              return;
            } else if (hasDetails) {
              router.push({
                pathname: '/import/review-tournament-details',
                params: { details: JSON.stringify(data.tournament_details.details) },
              });
              return;
            }
            // AI found nothing useful, fall through to local extraction
          } else {
            console.warn('AI extraction returned', resp.status, '— falling back to local');
          }
        } catch (e) {
          console.warn('AI extraction failed, trying local:', e);
        }
      }

      // Local fallback — try both extractors
      const travelBookings = localExtractTravel(trimmed);
      const tournamentDetails = extractTournamentDetails(trimmed);

      // Filter out false-positive hotel/flight matches (e.g. "Hotel Information" section header)
      const realTravel = travelBookings.filter((b: any) => {
        if (b.type === 'hotel') {
          // Must have a confirmation number AND a parseable check-in date to be real
          const hasConfirm = !!(b.reservation_number && b.reservation_number.length >= 4);
          const hasRealDate = !!(b.check_in && /^\d{4}-\d{2}-\d{2}$/.test(b.check_in));
          return hasConfirm || (hasRealDate && b.cost);
        }
        if (b.type === 'flight') return !!(b.confirmation_code || (b.departure_date && /^\d{4}-\d{2}-\d{2}$/.test(b.departure_date)));
        return false;
      });
      const hasTravel = realTravel.length > 0;

      const hasTournament = !!(tournamentDetails.tournament_name || tournamentDetails.venue_name || tournamentDetails.venue_address ||
        tournamentDetails.ticket_sales_date || tournamentDetails.ticket_link ||
        tournamentDetails.schedule_link || tournamentDetails.division_info || tournamentDetails.notes);

      if (hasTravel && hasTournament) {
        router.push({
          pathname: '/import/review-travel',
          params: {
            bookings: JSON.stringify(realTravel),
            pendingDetails: JSON.stringify(tournamentDetails),
          },
        });
      } else if (hasTravel) {
        router.push({
          pathname: '/import/review-travel',
          params: { bookings: JSON.stringify(realTravel) },
        });
      } else if (hasTournament) {
        router.push({
          pathname: '/import/review-tournament-details',
          params: { details: JSON.stringify(tournamentDetails) },
        });
      } else {
        setErrorMsg('Could not extract any travel or tournament details. Try pasting a different email or message.');
      }
    } catch (err: any) {
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
            Paste + AI
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 px-4 pt-4">
          {/* Instructions */}
          <View className="bg-rally-50 rounded-xl p-4 mb-4">
            <View className="flex-row items-start">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm text-rally-700 ml-2 flex-1">
                Paste anything — hotel confirmations, flight bookings, tournament emails, coach messages. AI figures out what it is and extracts the details.
              </Text>
            </View>
          </View>

          {/* Error */}
          {errorMsg && (
            <View className="bg-red-50 rounded-xl p-4 mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 ml-2 flex-1">{errorMsg}</Text>
            </View>
          )}

          {/* Single text input */}
          <View className="flex-1 mb-4">
            <Text className="text-sm font-medium text-bark mb-2">
              Paste email or message
            </Text>
            <TextInput
              className="flex-1 bg-cream rounded-xl p-4 text-sm text-bark border border-parchment"
              multiline
              textAlignVertical="top"
              placeholder="Paste a hotel confirmation, flight booking, tournament info email, coach message..."
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
                <Text className="text-sm font-semibold text-cream ml-2">Extract</Text>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Local fallback travel extraction (regex-based).
 */
function localExtractTravel(text: string): any[] {
  const bookings: any[] = [];

  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04',
    june: '06', july: '07', august: '08', september: '09',
    october: '10', november: '11', december: '12',
  };

  // --- Flights ---
  const airlinePatterns: [RegExp, string][] = [
    [/delta/i, 'Delta'], [/southwest/i, 'Southwest'], [/united/i, 'United'],
    [/american\s+airlines?/i, 'American'], [/jetblue/i, 'JetBlue'],
    [/spirit/i, 'Spirit'], [/frontier/i, 'Frontier'], [/alaska/i, 'Alaska'],
  ];

  let detectedAirline = '';
  for (const [pattern, name] of airlinePatterns) {
    if (pattern.test(text)) { detectedAirline = name; break; }
  }

  if (detectedAirline || /flight|depart.*→|arrive|boarding/i.test(text)) {
    const confirmMatch = text.match(/(?:confirmation|conf(?:irmation)?)[\s#:]*(?:number)?[\s#:]*([A-Z0-9]{5,8})/i);
    const nameMatch = text.match(/(?:name|passenger)[:\s]*([A-Z][A-Z ]+[A-Z])/i);
    const travelerNames = nameMatch ? [nameMatch[1].trim().split(/\s+/).map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')] : [];

    // Extract flight number (e.g. DL4027, SW 1234, UA123)
    const flightNumMatch = text.match(/(?:flight|flt)[:\s#]*([A-Z]{2}\s?\d{1,4})/i)
      || text.match(/\b([A-Z]{2}\s?\d{3,4})\b/);
    const flightNumber = flightNumMatch?.[1]?.replace(/\s/g, '') || '';

    // Extract departure/arrival times
    const timeMatches = [...text.matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g)];
    const departureTime = timeMatches.length >= 1 ? timeMatches[0][1].trim() : '';
    const arrivalTime = timeMatches.length >= 2 ? timeMatches[1][1].trim() : '';

    // Extract airport codes (3-letter uppercase)
    const airportMatches = [...text.matchAll(/\b([A-Z]{3})\b/g)].map(m => m[1])
      .filter(code => !['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'HAD', 'HAS', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].includes(code));
    const departureAirport = airportMatches.length >= 1 ? airportMatches[0] : '';
    const arrivalAirport = airportMatches.length >= 2 ? airportMatches[1] : '';

    // Extract seat number
    const seatMatch = text.match(/(?:seat)[:\s]*(\d{1,2}[A-F])/i);
    const seatNumber = seatMatch?.[1] || '';

    const dateLineMatches = [...text.matchAll(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*(\d{1,2})([A-Z]{3})/gi)];
    const longDateMatches = [...text.matchAll(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/g)];
    const isoDateMatches = [...text.matchAll(/(\d{4}-\d{2}-\d{2})/g)];

    let departureDate = '';
    let returnDate = '';
    const currentYear = new Date().getFullYear();

    if (dateLineMatches.length >= 2) {
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
    }

    bookings.push({
      type: 'flight',
      airline: detectedAirline || 'Other',
      confirmation_code: confirmMatch?.[1] || '',
      flight_number: flightNumber,
      departure_date: departureDate,
      return_date: returnDate,
      departure_time: departureTime,
      arrival_time: arrivalTime,
      departure_airport: departureAirport,
      arrival_airport: arrivalAirport,
      seat_number: seatNumber,
      ticket_number: '',
      booked_by: '',
      traveler_names: travelerNames,
      cost: null,
    });
  }

  // --- Hotels ---
  const hotelPatterns: [RegExp, string][] = [
    [/marriott|bonvoy|courtyard|residence inn|westin|sheraton|w hotel/i, 'Bonvoy'],
    [/hilton|hampton|doubletree|embassy suites|waldorf/i, 'Direct'],
    [/hyatt/i, 'Direct'],
    [/booking\.com/i, 'Booking.com'],
    [/expedia/i, 'Expedia'],
    [/amex\s*travel|american express.*travel|fine hotels/i, 'Amex Travel'],
  ];

  let detectedPlatform = 'Other';
  const hotelMatch = text.match(/(?:hotel|marriott|hilton|sheraton|hyatt|courtyard|residence inn|hampton|doubletree|westin|holiday inn|comfort inn|best western|la quinta)/i);

  if (hotelMatch || /check[- ]?in|check[- ]?out|reservation|arrival.*\d|departure.*\d/i.test(text)) {
    for (const [pattern, platform] of hotelPatterns) {
      if (pattern.test(text)) { detectedPlatform = platform; break; }
    }

    // THS detection
    if (/team hotel store|THS/i.test(text)) detectedPlatform = 'THS';

    const confirmMatch = text.match(/(?:hotel\s+)?(?:confirmation|reservation|conf)(?:\s+number)?[#:\s]*([A-Z0-9-]+)/i);
    const checkInMatch = text.match(/(?:check[- ]?in|arrival)[:\s]*(.+?)(?:\n|$)/i);
    const checkOutMatch = text.match(/(?:check[- ]?out|departure)[:\s]*(.+?)(?:\n|$)/i);
    const guestMatch = text.match(/(?:primary\s+)?guest\s*name?[:\s]*(.+?)(?:\n|$)/i) ?? text.match(/(?:main\s+guest|traveler\s+(?:name|information))[:\s]*\n*(.+?)(?:\n|$)/i);
    const rateMatch = text.match(/(?:room\s+)?rate[:\s]*\$?([\d,.]+)/i) ?? text.match(/(?:total\s+)?cost[:\s]*\$?([\d,.]+)/i) ?? text.match(/(?:estimated\s+)?(?:total|amount)[:\s]*\$?([\d,.]+)/i);

    let hotelName = '';
    // Try to find property name near confirmation number (common in booking emails)
    const nearConfirm = text.match(/(?:confirmation|reservation)[\s\S]{0,100}?\n\n([A-Z][A-Za-z\s&']+(?:Hotel|Resort|Inn|Suites|Lodge|Heights|Beach|Bay|Club|Palace|Plaza|Tower|Grand|Park|Place))/i);
    if (nearConfirm) hotelName = nearConfirm[1].trim();
    if (!hotelName) {
      // Match "Hotel Details" header followed by property name
      const afterHeader = text.match(/hotel\s+details[\s\S]*?\n\n([A-Z][A-Za-z\s&']+?)(?:\n|$)/i);
      if (afterHeader && afterHeader[1].trim().length > 3 && !/^details$/i.test(afterHeader[1].trim())) {
        hotelName = afterHeader[1].trim();
      }
    }
    if (!hotelName) {
      const hotelNameMatch = text.match(/(?:hotel|resort|inn|suites|lodge)[:\s]*(.+?)(?:\n|$)/i);
      if (hotelNameMatch && !/^details$/i.test(hotelNameMatch[1].trim())) hotelName = hotelNameMatch[1].trim();
    }
    if (!hotelName) {
      const brandLineMatch = text.match(/^((?:Hilton|Marriott|Hyatt|Sheraton|Westin|Hampton|Courtyard|Residence Inn|DoubleTree|Embassy Suites|Holiday Inn|Comfort Inn|Best Western|La Quinta|Palm Heights|Ritz.Carlton|Kimpton)\s*[\w\s]*?)$/im);
      if (brandLineMatch) hotelName = brandLineMatch[1].trim();
    }
    if (!hotelName && hotelMatch) hotelName = hotelMatch[0];

    const parseDate = (raw: string): string => {
      const t = raw.trim();
      const slash = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (slash) {
        let y = slash[3]; if (y.length === 2) y = '20' + y;
        return `${y}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
      }
      const long = t.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
      if (long) {
        const m = monthMap[long[1].toLowerCase()];
        if (m) return `${long[3]}-${m}-${long[2].padStart(2, '0')}`;
      }
      const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
      if (iso) return iso[1];
      return t;
    };

    if (hotelMatch || checkInMatch) {
      bookings.push({
        type: 'hotel',
        hotel_name: hotelName,
        reservation_number: confirmMatch?.[1] || '',
        check_in: checkInMatch ? parseDate(checkInMatch[1]) : '',
        check_out: checkOutMatch ? parseDate(checkOutMatch[1]) : '',
        platform: detectedPlatform,
        booking_name: guestMatch?.[1]?.trim() || '',
        booked_by: '',
        cost: rateMatch ? parseFloat(rateMatch[1].replace(',', '')) : null,
      });
    }
  }

  return bookings;
}
