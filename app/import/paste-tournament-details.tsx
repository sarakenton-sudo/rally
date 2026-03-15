import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export interface ExtractedTournamentDetails {
  venue_name: string;
  venue_address: string;
  location_city: string;
  ticket_sales_date: string;
  ticket_link: string;
  ticket_system: string;
  schedule_link: string;
  schedule_available_date: string;
  division_info: string;
  notes: string;
}

/**
 * Local extraction for tournament detail emails.
 * Pulls out venue, ticket info, schedule links, dates, etc.
 */
function extractTournamentDetails(text: string): ExtractedTournamentDetails {
  const result: ExtractedTournamentDetails = {
    venue_name: '',
    venue_address: '',
    location_city: '',
    ticket_sales_date: '',
    ticket_link: '',
    ticket_system: '',
    schedule_link: '',
    schedule_available_date: '',
    division_info: '',
    notes: '',
  };

  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const parseDate = (dateStr: string): string => {
    // "March 16, 2026" or "Mar 16, 2026"
    const longMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (longMatch) {
      const m = monthMap[longMatch[1].toLowerCase()];
      if (m) return `${longMatch[3]}-${m}-${longMatch[2].padStart(2, '0')}`;
    }
    // "2026-03-16"
    const isoMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    return dateStr.trim();
  };

  // Venue: look for convention center, arena, complex, etc.
  const venueMatch = text.match(/(?:Location|Venue)[:\s]*\n?\s*(.+?)(?:\n|$)/i)
    || text.match(/([\w\s]+(?:Convention Center|Arena|Complex|Center|Fieldhouse|Sports Center|Coliseum|Expo|Facility))/i);
  if (venueMatch) {
    result.venue_name = venueMatch[1].trim();
  }

  // Address: look for street address pattern after venue
  const addressMatch = text.match(/(\d{1,5}\s+(?:\d+(?:st|nd|rd|th)\s+)?(?:Ave|Avenue|St|Street|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Pkwy|Parkway|Ln|Lane|Ct|Court)\b[^,\n]*,\s*\w[\w\s]*,\s*[A-Z]{2}\s*\d{5})/i)
    || text.match(/(\d{1,5}\s+[A-Z0-9][\w\s]+(?:Ave|Avenue|St|Street|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Pkwy|Parkway|Ln|Lane|Ct|Court)\b[^,\n]*,\s*\w[\w\s]*,\s*[A-Z]{2})/i);
  if (addressMatch) {
    result.venue_address = addressMatch[1].trim();
    // Extract city from address
    const cityMatch = result.venue_address.match(/,\s*([\w\s]+),\s*[A-Z]{2}/);
    if (cityMatch) {
      const state = result.venue_address.match(/,\s*([A-Z]{2})(?:\s*\d{5})?$/);
      result.location_city = `${cityMatch[1].trim()}, ${state?.[1] || ''}`.trim();
    }
  }

  // Ticket sales date
  const ticketDateMatch = text.match(/ticket\s*(?:sales?\s*)?(?:open|available|go\s*on\s*sale|start)[:\s]*(.+?)(?:\n|$)/i)
    || text.match(/(?:on\s*sale|sales?\s*open)[:\s]*(.+?)(?:\n|$)/i);
  if (ticketDateMatch) {
    result.ticket_sales_date = parseDate(ticketDateMatch[1]);
  }

  // Ticket link (URL)
  const urlMatches = [...text.matchAll(/https?:\/\/[^\s<>")\]]+/gi)];
  for (const m of urlMatches) {
    const url = m[0].toLowerCase();
    if (url.includes('ticket') || url.includes('spectator') || url.includes('admission')) {
      result.ticket_link = m[0];
      break;
    }
  }

  // Ticket system detection
  if (/dragonfly|eventbrite/i.test(text)) result.ticket_system = 'Eventbrite';
  else if (/showpass/i.test(text)) result.ticket_system = 'Showpass';
  else if (/electronic\s*ticket/i.test(text)) result.ticket_system = 'Electronic';

  // Schedule link
  for (const m of urlMatches) {
    const url = m[0].toLowerCase();
    if (url.includes('schedule') || url.includes('vbschedule') || url.includes('sportwrench') || url.includes('aes')) {
      result.schedule_link = m[0];
      break;
    }
  }
  // Also check for named schedule sites
  if (!result.schedule_link) {
    const schedSiteMatch = text.match(/(?:posted|available|found|view)\s+(?:on|at)\s+((?:VBSchedule|SportWrench|AES\s*Athletics)\.com)/i);
    if (schedSiteMatch) {
      const site = schedSiteMatch[1].toLowerCase();
      if (site.includes('vbschedule')) result.schedule_link = 'https://www.vbschedule.com';
      else if (site.includes('sportwrench')) result.schedule_link = 'https://www.sportwrench.com';
      else if (site.includes('aes')) result.schedule_link = 'https://www.aesathletics.com';
    }
  }

  // Schedule available date
  const schedDateMatch = text.match(/schedule[:\s]*(?:posted|available|released)\s+(?:on\s+)?(\w+\s+(?:night\s+)?(?:prior|before)\s+(?:to\s+)?(?:the\s+)?event)/i);
  if (schedDateMatch) {
    // "Wednesday night prior to the event" — we'll store the description and let user set the date
    result.schedule_available_date = schedDateMatch[1].trim();
  }
  // More specific: "Schedule: Posted March 18, 2026"
  const schedDate2 = text.match(/schedule[:\s]*(?:posted|available|released)\s+(?:on\s+)?(\w+\s+\d{1,2},?\s*\d{4})/i);
  if (schedDate2) {
    result.schedule_available_date = parseDate(schedDate2[1]);
  }

  // Division info
  const divisionMatch = text.match(/division[:\s]*(.+?)(?:\n|$)/i);
  if (divisionMatch) {
    result.division_info = divisionMatch[1].trim();
  }

  // Collect notes from important sections
  const noteParts: string[] = [];

  // Start times
  const startTimeMatch = text.match(/(?:tentative\s+)?start\s*time[:\s]*(.+?)(?:\n|$)/i);
  if (startTimeMatch) noteParts.push(`Start: ${startTimeMatch[1].trim()}`);

  // Division info as note
  if (result.division_info) noteParts.push(`Division: ${result.division_info}`);

  // Warm-up balls, code of conduct, etc.
  if (/warm[- ]?up balls?\s+(?:are\s+)?not\s+provided/i.test(text)) {
    noteParts.push('Warm-up balls NOT provided');
  }

  // Ticket pricing summary
  const adultPriceMatch = text.match(/3-day\s*pass[:\s]*\$(\d+)/i);
  if (adultPriceMatch) {
    noteParts.push(`Adult 3-Day Pass: $${adultPriceMatch[1]}`);
  }

  if (noteParts.length > 0) {
    result.notes = noteParts.join('\n');
  }

  return result;
}

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
        const details = extractTournamentDetails(trimmed);
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
