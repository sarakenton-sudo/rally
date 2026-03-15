import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { updateTournament as updateTournamentDB, insertHotelBooking, insertFlightBooking, updateFlightBooking, updateHotelBooking } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import type { Tournament } from '@/types/database';

const CLASS_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  stay_and_play: { icon: 'bed', color: '#7c3aed', label: 'Hotel / Stay & Play' },
  travel_confirmation: { icon: 'airplane', color: '#3B82B0', label: 'Travel Confirmation' },
  coach_announcement: { icon: 'megaphone', color: '#d97706', label: 'Coach Announcement' },
  schedule_change: { icon: 'swap-horizontal', color: '#dc2626', label: 'Schedule Change' },
  tournament_info: { icon: 'trophy', color: '#16a34a', label: 'Tournament Info' },
  other: { icon: 'mail', color: '#8FA8BF', label: 'Other' },
};

const DATA_LABELS: Record<string, string> = {
  hotel_name: 'Hotel',
  check_in_date: 'Check-in',
  check_out_date: 'Check-out',
  confirmation_number: 'Confirmation #',
  nightly_rate: 'Nightly Rate',
  total_cost: 'Total Cost',
  cancellation_deadline: 'Cancel By',
  address: 'Address',
  phone: 'Phone',
  booking_url: 'Booking Link',
  airline: 'Airline',
  flight_number: 'Flight #',
  ticket_number: 'Ticket #',
  departure_date: 'Departure',
  departure_time: 'Departs',
  arrival_time: 'Arrives',
  departure_airport: 'From',
  arrival_airport: 'To',
  tournament_name: 'Tournament',
  start_date: 'Start Date',
  end_date: 'End Date',
  location_city: 'City',
  venue_name: 'Venue',
  venue_address: 'Venue Address',
  pool_info: 'Pool',
  check_in_time: 'Check-in Time',
  schedule_url: 'Schedule Link',
  schedule_available_date: 'Schedule Posts',
  schedule_available_description: 'Schedule Timing',
  ticket_code: 'Ticket Code',
  ticket_url: 'Ticket Link',
  ticket_sales_date: 'Tickets On Sale',
  ticket_sales_description: 'Ticket Timing',
  registration_deadline: 'Register By',
  entry_fee: 'Entry Fee',
  action_items: 'Action Items',
  passenger_name: 'Passenger',
  departure_city: 'From City',
  arrival_city: 'To City',
  return_date: 'Return Date',
  number_of_nights: 'Nights',
  outbound: 'Outbound Flight',
  return: 'Return Flight',
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Preserve links: convert <a href="url">text</a> → text (url)
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      // Skip tracking/unsubscribe links
      if (url.includes('unsubscribe') || url.includes('optout') || url.includes('manage-preferences')) return cleanText;
      // Skip if URL is same as text (redundant)
      if (cleanText === url) return `🔗 ${url}`;
      return cleanText ? `${cleanText} (${url})` : `🔗 ${url}`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<hr[^>]*>/gi, '\n---\n')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, '')
    // Clean up whitespace: collapse runs of spaces, limit newlines
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanEmailBody(text: string): string {
  // If it looks like HTML, strip tags but preserve links
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return stripHtml(text);
  }
  return text;
}

function extractTicketUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) ?? [];
  const ticketKeywords = ['ticket', 'aes', 'gofan', 'aesathletics'];
  return urls.filter((url) => ticketKeywords.some((kw) => url.toLowerCase().includes(kw)));
}

function isUrl(value: string): boolean {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

// Score how well extracted data matches a tournament (0-100)
function matchScore(tournament: Tournament, extracted: Record<string, unknown>, emailSubject: string, emailBody: string): number {
  let score = 0;
  const tName = tournament.name.toLowerCase();
  const eName = String(extracted.tournament_name ?? '').toLowerCase();
  const fullText = `${emailSubject} ${emailBody}`.toLowerCase();

  // Name matching — fuzzy
  if (eName) {
    // Exact substring match
    if (tName.includes(eName) || eName.includes(tName)) {
      score += 50;
    } else {
      // Word overlap
      const tWords = tName.split(/\s+/).filter((w) => w.length > 2);
      const eWords = eName.split(/\s+/).filter((w) => w.length > 2);
      const overlap = tWords.filter((w) => eWords.some((ew) => ew.includes(w) || w.includes(ew)));
      if (overlap.length > 0) {
        score += Math.min(40, overlap.length * 15);
      }
    }
  }

  // Check if tournament name appears anywhere in email
  if (!eName) {
    const tWords = tName.split(/\s+/).filter((w) => w.length > 3);
    const bodyMatches = tWords.filter((w) => fullText.includes(w));
    if (bodyMatches.length >= 2) {
      score += Math.min(35, bodyMatches.length * 12);
    }
  }

  // Date matching — tournament dates or travel dates
  const eStart = String(extracted.start_date ?? '');
  const eEnd = String(extracted.end_date ?? '');
  if (eStart && tournament.start_date === eStart) score += 25;
  else if (eStart && tournament.start_date?.slice(0, 7) === eStart.slice(0, 7)) score += 10;
  if (eEnd && tournament.end_date === eEnd) score += 10;

  // Match flights/hotels by travel date proximity to tournament
  const travelDate = String(extracted.departure_date ?? extracted.check_in_date ?? (extracted.outbound as any)?.departure_date ?? '');
  if (travelDate && tournament.start_date) {
    const diffMs = Math.abs(new Date(travelDate).getTime() - new Date(tournament.start_date).getTime());
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    if (diffDays <= 1) score += 40;
    else if (diffDays <= 3) score += 25;
    else if (diffDays <= 5) score += 10;
  }

  // City matching
  const eCity = String(extracted.location_city ?? '').toLowerCase();
  const tCity = (tournament.location_city ?? '').toLowerCase();
  if (eCity && tCity && (tCity.includes(eCity) || eCity.includes(tCity))) score += 15;

  return Math.min(100, score);
}

interface SuggestedUpdate {
  field: string;
  label: string;
  currentValue: string;
  newValue: string;
  dbField: string;
}

function getSuggestedUpdates(tournament: Tournament, extracted: Record<string, unknown>): SuggestedUpdate[] {
  const suggestions: SuggestedUpdate[] = [];

  // Venue name & address
  const venueName = String(extracted.venue_name ?? '');
  const venueAddress = String(extracted.venue_address ?? '');
  if (venueName || venueAddress) {
    const currentVenue = tournament.venues?.[0];
    if (!currentVenue?.label || !currentVenue?.address) {
      suggestions.push({
        field: 'venue',
        label: 'Venue',
        currentValue: currentVenue?.label ? `${currentVenue.label} — ${currentVenue.address || 'no address'}` : 'Not set',
        newValue: `${venueName}${venueAddress ? ` — ${venueAddress}` : ''}`,
        dbField: 'venues',
      });
    }
  }

  // Schedule link
  const scheduleUrl = String(extracted.schedule_url ?? '');
  if (scheduleUrl && isUrl(scheduleUrl) && !tournament.schedule_link) {
    suggestions.push({
      field: 'schedule_url',
      label: 'Schedule Link',
      currentValue: tournament.schedule_link ?? 'Not set',
      newValue: scheduleUrl,
      dbField: 'schedule_link',
    });
  }

  // Schedule available date
  const scheduleAvailDate = String(extracted.schedule_available_date ?? '');
  if (scheduleAvailDate && !tournament.schedule_available_date) {
    const desc = String(extracted.schedule_available_description ?? scheduleAvailDate);
    suggestions.push({
      field: 'schedule_available_date',
      label: 'Schedule Posts',
      currentValue: tournament.schedule_available_date ?? 'Not set',
      newValue: scheduleAvailDate,
      dbField: 'schedule_available_date',
    });
  }

  // Ticket sales date
  const ticketSalesDate = String(extracted.ticket_sales_date ?? '');
  if (ticketSalesDate && !tournament.ticket_sales_date) {
    suggestions.push({
      field: 'ticket_sales_date',
      label: 'Tickets On Sale',
      currentValue: tournament.ticket_sales_date ?? 'Not set',
      newValue: ticketSalesDate,
      dbField: 'ticket_sales_date',
    });
  }

  // Ticket link
  const ticketUrl = String(extracted.ticket_url ?? '');
  if (ticketUrl && isUrl(ticketUrl) && !tournament.ticket_link) {
    suggestions.push({
      field: 'ticket_link',
      label: 'Ticket Link',
      currentValue: tournament.ticket_link ?? 'Not set',
      newValue: ticketUrl,
      dbField: 'ticket_link',
    });
  }

  // Ticket code
  const ticketCode = String(extracted.ticket_code ?? '');
  if (ticketCode) {
    suggestions.push({
      field: 'ticket_code',
      label: 'Ticket Code',
      currentValue: (tournament as any).ticket_code ?? 'Not set',
      newValue: ticketCode,
      dbField: 'ticket_code',
    });
  }

  // Location city
  const locationCity = String(extracted.location_city ?? '');
  if (locationCity && !tournament.location_city) {
    suggestions.push({
      field: 'location_city',
      label: 'City',
      currentValue: tournament.location_city || 'Not set',
      newValue: locationCity,
      dbField: 'location_city',
    });
  }

  return suggestions;
}

export default function EmailDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const storeEmail = useSeasonStore((s) => s.forwardedEmails.find((e) => e.id === id));
  const addForwardedEmail = useSeasonStore((s) => s.addForwardedEmail);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const updateForwardedEmail = useSeasonStore((s) => s.updateForwardedEmail);
  const { user } = useAuth();
  const [showFullBody, setShowFullBody] = useState(false);
  const [appliedUpdates, setAppliedUpdates] = useState<Set<string>>(new Set());
  const [overrideMatch, setOverrideMatch] = useState<string>('');
  const [fetchedEmail, setFetchedEmail] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);

  // If email isn't in store, fetch directly from Supabase
  useEffect(() => {
    if (!storeEmail && id && isSupabaseConfigured && !fetchedEmail && !isFetching) {
      setIsFetching(true);
      supabase
        .from('forwarded_emails')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            setFetchedEmail(data);
            // Also add to store so it persists during this session
            addForwardedEmail(data as any);
          }
          setIsFetching(false);
        });
    }
  }, [id, storeEmail, fetchedEmail, isFetching]);

  const email = storeEmail ?? fetchedEmail;

  if (!email) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center">
        {isFetching ? (
          <Text className="text-lg text-stone">Loading email...</Text>
        ) : (
          <>
            <Text className="text-lg text-stone">Email not found</Text>
            <Pressable onPress={() => router.back()} className="mt-4">
              <Text className="text-rally-600 font-semibold">Go back</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    );
  }

  const cls = CLASS_CONFIG[email.classification] ?? CLASS_CONFIG.other;
  const receivedDate = new Date(email.received_at);
  const extractedData = (email as any).extracted_data as Record<string, unknown> | null;
  const hasExtractedData = extractedData && Object.keys(extractedData).length > 0;

  // AI tournament matching
  const tournamentMatch = useMemo(() => {
    if (!hasExtractedData || !tournaments.length) return null;

    const scored = tournaments
      .map((t) => ({ tournament: t, score: matchScore(t, extractedData!, email.subject, email.body_text) }))
      .filter((s) => s.score >= 20)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    return scored[0];
  }, [email, extractedData, tournaments]);

  // Allow user override
  const activeMatch = overrideMatch
    ? tournaments.find((t) => t.name === overrideMatch)
    : tournamentMatch?.tournament;

  const suggestedUpdates = useMemo(() => {
    if (!activeMatch || !hasExtractedData) return [];
    return getSuggestedUpdates(activeMatch, extractedData!);
  }, [activeMatch, extractedData]);

  const handleApplyUpdate = async (update: SuggestedUpdate) => {
    if (!activeMatch) return;

    let dbUpdates: any = {};
    if (update.dbField === 'venues') {
      const venueName = String(extractedData?.venue_name ?? '');
      const venueAddress = String(extractedData?.venue_address ?? '');
      dbUpdates.venues = [{ label: venueName, address: venueAddress, is_confirmed: false }];
    } else {
      dbUpdates[update.dbField] = update.newValue;
    }

    if (isSupabaseConfigured && user) {
      await updateTournamentDB(activeMatch.id, dbUpdates);
    }
    updateTournamentStore(activeMatch.id, dbUpdates);
    setAppliedUpdates((prev) => new Set([...prev, update.field]));
  };

  const handleApplyAll = async () => {
    const pending = suggestedUpdates.filter((u) => !appliedUpdates.has(u.field));
    for (const update of pending) {
      await handleApplyUpdate(update);
    }
  };

  const [savedBooking, setSavedBooking] = useState<'flight' | 'hotel' | null>(null);
  const [isSavingBooking, setIsSavingBooking] = useState(false);

  const handleSaveFlightBooking = async () => {
    if (!activeMatch || !extractedData || !user) return;
    setIsSavingBooking(true);
    try {
      const d = extractedData;
      const outbound = d.outbound as Record<string, unknown> | undefined;
      const returnLeg = (d.return ?? d.return_flight ?? d.return_leg) as Record<string, unknown> | undefined;

      const confCode = String(d.confirmation_number ?? d.confirmation_code ?? d.booking_reference ?? '');
      const flightData: Record<string, unknown> = {
        tournament_id: activeMatch.id,
        airline: String(d.airline ?? outbound?.airline ?? ''),
        confirmation_code: confCode,
        departure_date: String(d.departure_date ?? outbound?.departure_date ?? '') || undefined,
        return_date: String(d.return_date ?? returnLeg?.departure_date ?? '') || undefined,
        booked_by: String(d.passenger_name ?? d.traveler_name ?? '') || undefined,
        traveler_names: d.passenger_name ? [String(d.passenger_name)] : undefined,
        cost: d.total_cost ? Number(d.total_cost) : undefined,
        ticket_number: String(d.ticket_number ?? '') || undefined,
        departure_time: String(d.departure_time ?? outbound?.departure_time ?? '') || undefined,
        arrival_time: String(d.arrival_time ?? outbound?.arrival_time ?? '') || undefined,
        seat_number: String(d.seat_number ?? outbound?.seat_number ?? '') || undefined,
        flight_number: String(d.flight_number ?? outbound?.flight_number ?? '') || undefined,
      };

      // Remove undefined values so we don't overwrite existing data with blanks
      const cleanData = Object.fromEntries(Object.entries(flightData).filter(([_, v]) => v !== undefined));

      // Check if a flight booking already exists for this tournament (match by confirmation code or tournament)
      const flightBookings = useSeasonStore.getState().flightBookings;
      const existing = flightBookings.find((f) =>
        (confCode && f.confirmation_code === confCode) ||
        f.tournament_id === activeMatch.id
      );

      if (existing) {
        // Update existing — only fill in fields that are currently empty
        const updates: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(cleanData)) {
          if (key === 'tournament_id') continue;
          const current = (existing as any)[key];
          if (!current || current === '' || current === null) {
            updates[key] = val;
          }
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await updateFlightBooking(existing.id, updates as any);
          if (error) throw error;
        }
        setSavedBooking('flight');
        const msg = Object.keys(updates).length > 0
          ? `Updated ${Object.keys(updates).length} fields on existing flight booking.`
          : 'Flight booking already has all this data.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Updated', msg);
      } else {
        // Create new
        const { error } = await insertFlightBooking({
          ...cleanData,
          created_by_user_id: user.id,
          tournament_id: activeMatch.id,
          airline: cleanData.airline as string ?? '',
          confirmation_code: confCode,
          departure_date: cleanData.departure_date as string ?? '',
          return_date: cleanData.return_date as string ?? '',
          booked_by: cleanData.booked_by as string ?? '',
          traveler_names: cleanData.traveler_names as string[] ?? [],
          cost: cleanData.cost as number ?? null,
          ticket_number: cleanData.ticket_number as string ?? '',
        } as any);
        if (error) throw error;
        setSavedBooking('flight');
        if (Platform.OS === 'web') window.alert('Flight booking saved!');
        else Alert.alert('Saved', 'Flight booking created and linked to tournament.');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Save failed: ${err.message}`);
      else Alert.alert('Save Failed', err.message);
    } finally {
      setIsSavingBooking(false);
    }
  };

  const handleSaveHotelBooking = async () => {
    if (!activeMatch || !extractedData || !user) return;
    setIsSavingBooking(true);
    try {
      const d = extractedData;
      const confNum = String(d.confirmation_number ?? d.reservation_number ?? '');

      const hotelData: Record<string, unknown> = {
        tournament_id: activeMatch.id,
        hotel_name: String(d.hotel_name ?? '') || undefined,
        booking_name: String(d.hotel_name ?? '') || undefined,
        booked_by: String(d.passenger_name ?? d.guest_name ?? '') || undefined,
        reservation_number: confNum || undefined,
        check_in: String(d.check_in_date ?? '') || undefined,
        check_out: String(d.check_out_date ?? '') || undefined,
        cancellation_deadline: String(d.cancellation_deadline ?? '') || undefined,
        cost: d.total_cost ? Number(d.total_cost) : (d.nightly_rate ? Number(d.nightly_rate) : undefined),
        address: String(d.address ?? d.hotel_address ?? '') || undefined,
      };
      const cleanData = Object.fromEntries(Object.entries(hotelData).filter(([_, v]) => v !== undefined));

      // Check if hotel booking already exists
      const hotelBookings = useSeasonStore.getState().hotelBookings;
      const existing = hotelBookings.find((h) =>
        (confNum && h.reservation_number === confNum) ||
        h.tournament_id === activeMatch.id
      );

      if (existing) {
        const updates: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(cleanData)) {
          if (key === 'tournament_id') continue;
          const current = (existing as any)[key];
          if (!current || current === '' || current === null) {
            updates[key] = val;
          }
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await updateHotelBooking(existing.id, updates as any);
          if (error) throw error;
        }
        setSavedBooking('hotel');
        const msg = Object.keys(updates).length > 0
          ? `Updated ${Object.keys(updates).length} fields on existing hotel booking.`
          : 'Hotel booking already has all this data.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Updated', msg);
      } else {
        const { error } = await insertHotelBooking({
          ...cleanData,
          created_by_user_id: user.id,
          tournament_id: activeMatch.id,
          hotel_name: cleanData.hotel_name as string ?? '',
          platform: 'Other',
          booking_name: cleanData.booking_name as string ?? '',
          booked_by: cleanData.booked_by as string ?? '',
          reservation_number: confNum,
          check_in: cleanData.check_in as string ?? '',
          check_out: cleanData.check_out as string ?? '',
          cancellation_deadline: cleanData.cancellation_deadline as string ?? '',
          cost: cleanData.cost as number ?? null,
          is_backup: false,
          status: 'confirmed',
          address: cleanData.address as string ?? '',
        } as any);
        if (error) throw error;
        setSavedBooking('hotel');
        if (Platform.OS === 'web') window.alert('Hotel booking saved!');
        else Alert.alert('Saved', 'Hotel booking created and linked to tournament.');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Save failed: ${err.message}`);
      else Alert.alert('Save Failed', err.message);
    } finally {
      setIsSavingBooking(false);
    }
  };

  const handleExtractSchedule = async () => {
    if (isSupabaseConfigured && user) {
      try {
        const { data, error } = await supabase.functions.invoke('extract-schedule', {
          body: { text: `Subject: ${email.subject}\n\n${email.body_text}` },
        });
        if (error) throw new Error(error.message);
        const t = data?.tournaments;
        if (!t || t.length === 0) {
          if (Platform.OS === 'web') window.alert('Could not extract tournament details from this email.');
          else Alert.alert('No tournaments found', 'Could not extract tournament details from this email.');
          return;
        }
        router.push({ pathname: '/import/review', params: { tournaments: JSON.stringify(t) } });
      } catch (err: any) {
        if (Platform.OS === 'web') window.alert(err.message);
        else Alert.alert('Extraction failed', err.message);
      }
    } else {
      router.push({ pathname: '/import/paste' });
    }
  };

  const [isReExtracting, setIsReExtracting] = useState(false);

  const handleReExtract = async () => {
    if (!isSupabaseConfigured || !user) return;
    setIsReExtracting(true);
    try {
      // Call classify-email edge function directly via fetch (avoids supabase client overhead)
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const response = await fetch(`${SUPABASE_URL}/functions/v1/classify-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: email.from_address,
          subject: email.subject,
          body: (email.body_text ?? '').slice(0, 10000),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Classification failed (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const newClassification = data?.classification ?? email.classification;
      const newExtractedData = data?.extracted_data ?? {};
      const newSummary = data?.summary ?? '';
      const newAction = data?.action ?? email.action_taken;

      // Update the email record in DB
      await (supabase
        .from('forwarded_emails') as any)
        .update({
          classification: newClassification,
          extracted_data: newExtractedData,
          action_taken: newAction,
        })
        .eq('id', email.id);

      // Update local store
      updateForwardedEmail(email.id, {
        classification: newClassification,
        extracted_data: newExtractedData,
        action_taken: newAction,
      } as any);

      if (Platform.OS === 'web') window.alert(`Re-extracted! Classification: ${newClassification}. ${Object.keys(newExtractedData).length} fields found.`);
      else Alert.alert('Re-extracted', `Classification: ${newClassification}. ${Object.keys(newExtractedData).length} fields found.`);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Re-extract failed: ${err.message}`);
      else Alert.alert('Failed', err.message);
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleCreateHotelBooking = () => {
    const params: Record<string, string> = { emailSubject: email.subject };
    if (activeMatch) params.tournamentId = activeMatch.id;
    if (extractedData) {
      if (extractedData.hotel_name) params.hotelName = String(extractedData.hotel_name);
      if (extractedData.check_in_date) params.checkIn = String(extractedData.check_in_date);
      if (extractedData.check_out_date) params.checkOut = String(extractedData.check_out_date);
      if (extractedData.confirmation_number) params.confirmationNumber = String(extractedData.confirmation_number);
      if (extractedData.total_cost) params.cost = String(extractedData.total_cost);
      if (extractedData.cancellation_deadline) params.cancellationDeadline = String(extractedData.cancellation_deadline);
    }
    router.push({ pathname: '/booking/add-hotel', params });
  };

  const handleCreateFlightBooking = () => {
    const p: Record<string, string> = { emailSubject: email.subject };
    if (activeMatch) p.tournamentId = activeMatch.id;
    if (extractedData) {
      const d = extractedData;
      const outbound = d.outbound as Record<string, unknown> | undefined;
      const returnLeg = (d.return ?? d.return_flight ?? d.return_leg) as Record<string, unknown> | undefined;

      // Airline — check multiple possible field names
      const airline = d.airline ?? outbound?.airline ?? '';
      if (airline) p.airline = String(airline);

      // Confirmation
      const conf = d.confirmation_number ?? d.confirmation_code ?? d.booking_reference ?? d.record_locator ?? '';
      if (conf) p.confirmationCode = String(conf);

      // Departure date
      const depDate = d.departure_date ?? outbound?.departure_date ?? '';
      if (depDate) p.departureDate = String(depDate);

      // Return date
      const retDate = d.return_date ?? returnLeg?.departure_date ?? '';
      if (retDate) p.returnDate = String(retDate);

      // Traveler
      const traveler = d.passenger_name ?? d.traveler_name ?? d.passenger ?? d.name ?? '';
      if (traveler) p.travelerName = String(traveler);

      // Cost
      const cost = d.total_cost ?? d.cost ?? d.total ?? d.amount ?? '';
      if (cost) p.cost = String(cost);

      // Ticket number
      const ticket = d.ticket_number ?? d.ticket_no ?? '';
      if (ticket) p.ticketNumber = String(ticket);
    }
    router.push({ pathname: '/booking/add-flight', params: p });
  };

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url);
  };

  const renderValue = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    if (Array.isArray(value)) {
      return value.map((v, i) => (
        <Text key={i} className="text-sm text-bark dark:text-cream">
          {typeof v === 'string' && isUrl(v) ? (
            <Text className="text-rally-600 underline" onPress={() => openUrl(v)}>{v}</Text>
          ) : String(v)}
        </Text>
      ));
    }
    const str = String(value);
    if (isUrl(str)) {
      return (
        <Pressable onPress={() => openUrl(str)}>
          <Text className="text-sm text-rally-600 underline" numberOfLines={2}>{str}</Text>
        </Pressable>
      );
    }
    return <Text className="text-sm text-bark dark:text-cream">{str}</Text>;
  };

  const cleanBody = cleanEmailBody(email.body_text);
  const bodyIsLong = cleanBody.length > 500;
  const displayBody = showFullBody ? cleanBody : cleanBody.slice(0, 500);
  const confidenceLabel = tournamentMatch
    ? tournamentMatch.score >= 60 ? 'High confidence' : tournamentMatch.score >= 35 ? 'Likely match' : 'Possible match'
    : '';
  const confidenceColor = tournamentMatch
    ? tournamentMatch.score >= 60 ? '#16a34a' : tournamentMatch.score >= 35 ? '#d97706' : '#8FA8BF'
    : '#8FA8BF';

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-warm-white dark:bg-bark border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream flex-1" numberOfLines={1}>
          Email Detail
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Classification banner */}
        <View className="flex-row items-center bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-3 border border-parchment dark:border-rally-900">
          <Ionicons name={cls.icon} size={24} color={cls.color} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">{cls.label}</Text>
            <Text className="text-xs text-stone mt-0.5">
              AI classified • {receivedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* Email metadata */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-3 border border-parchment dark:border-rally-900">
          <View className="mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider">From</Text>
            <Text className="text-sm text-bark dark:text-cream mt-0.5">{email.from_address}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider">Subject</Text>
            <Text className="text-sm font-semibold text-bark dark:text-cream mt-0.5">{email.subject}</Text>
          </View>
          <View>
            <Text className="text-xs text-stone uppercase tracking-wider">Received</Text>
            <Text className="text-sm text-stone dark:text-parchment mt-0.5">
              {receivedDate.toLocaleString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Extracted data card */}
        {hasExtractedData && (
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-3 border border-rally-200 dark:border-rally-800">
            <View className="flex-row items-center mb-3">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-700 dark:text-rally-300 ml-2">
                AI Extracted Details
              </Text>
            </View>
            {Object.entries(extractedData!).map(([key, value]) => {
              if (value === null || value === undefined || value === '' || key === 'ticket_urls') return null;
              const label = DATA_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <View key={key} className="flex-row mb-2">
                  <Text className="text-xs text-stone w-28 pt-0.5">{label}</Text>
                  <View className="flex-1">{renderValue(key, value)}</View>
                </View>
              );
            })}
          </View>
        )}

        {/* AI Tournament Match */}
        {hasExtractedData && tournaments.length > 0 && (
          <View className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-3 border border-purple-200 dark:border-purple-800">
            <View className="flex-row items-center mb-3">
              <Ionicons name="link" size={18} color="#7c3aed" />
              <Text className="text-sm font-semibold text-purple-700 dark:text-purple-300 ml-2">
                Tournament Match
              </Text>
            </View>

            {tournamentMatch && !overrideMatch ? (
              <View>
                <View className="flex-row items-center mb-2">
                  <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: confidenceColor }} />
                  <Text className="text-xs font-semibold" style={{ color: confidenceColor }}>
                    {confidenceLabel}
                  </Text>
                </View>
                <View className="bg-white/60 dark:bg-bark-light rounded-lg p-3 mb-3">
                  <Text className="text-sm font-bold text-bark dark:text-cream">
                    {tournamentMatch.tournament.name}
                  </Text>
                  <Text className="text-xs text-stone mt-0.5">
                    {tournamentMatch.tournament.start_date} — {tournamentMatch.tournament.location_city || 'Location TBD'}
                  </Text>
                </View>
              </View>
            ) : !overrideMatch ? (
              <Text className="text-xs text-stone mb-2">No automatic match found.</Text>
            ) : null}

            {/* Override / manual select */}
            <DropdownField
              label={tournamentMatch && !overrideMatch ? 'Change match' : 'Select tournament'}
              value={overrideMatch}
              options={tournaments.map((t) => t.name)}
              onChange={setOverrideMatch}
            />

            {/* Suggested updates */}
            {activeMatch && suggestedUpdates.length > 0 && (
              <View className="mt-3">
                <Text className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-2">
                  Suggested Updates
                </Text>
                {suggestedUpdates.map((update) => {
                  const applied = appliedUpdates.has(update.field);
                  return (
                    <View key={update.field} className="bg-white/60 dark:bg-bark-light rounded-lg p-3 mb-2">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-xs font-semibold text-bark dark:text-cream">{update.label}</Text>
                        {applied ? (
                          <View className="flex-row items-center">
                            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                            <Text className="text-xs text-green-600 ml-1 font-semibold">Applied</Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handleApplyUpdate(update)}
                            className="bg-purple-600 px-3 py-1 rounded-lg active:opacity-80"
                          >
                            <Text className="text-xs font-semibold text-white">Apply</Text>
                          </Pressable>
                        )}
                      </View>
                      <Text className="text-xs text-stone line-through">{update.currentValue}</Text>
                      <Text className="text-sm text-bark dark:text-cream mt-0.5">{update.newValue}</Text>
                    </View>
                  );
                })}

                {suggestedUpdates.filter((u) => !appliedUpdates.has(u.field)).length > 1 && (
                  <Pressable
                    onPress={handleApplyAll}
                    className="bg-purple-600 rounded-lg py-3 items-center mt-1 active:opacity-80"
                  >
                    <Text className="text-sm font-semibold text-white">Apply All Updates</Text>
                  </Pressable>
                )}
              </View>
            )}

            {activeMatch && suggestedUpdates.length === 0 && (
              <Text className="text-xs text-stone mt-2">No new data to update for this tournament.</Text>
            )}

            {/* Save booking directly to matched tournament */}
            {activeMatch && hasExtractedData && (
              <View className="mt-3">
                {email.classification === 'travel_confirmation' && (
                  savedBooking === 'flight' ? (
                    <View className="flex-row items-center justify-center py-3">
                      <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                      <Text className="text-sm font-semibold text-green-600 ml-2">Flight Booking Saved</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleSaveFlightBooking}
                      disabled={isSavingBooking}
                      className={`rounded-lg py-3 items-center flex-row justify-center active:opacity-80 ${isSavingBooking ? 'bg-purple-400' : 'bg-purple-600'}`}
                    >
                      <Ionicons name="airplane" size={18} color="white" />
                      <Text className="text-sm font-semibold text-white ml-2">
                        {isSavingBooking ? 'Saving...' : `Save Flight to "${activeMatch.name}"`}
                      </Text>
                    </Pressable>
                  )
                )}
                {email.classification === 'stay_and_play' && (
                  savedBooking === 'hotel' ? (
                    <View className="flex-row items-center justify-center py-3">
                      <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                      <Text className="text-sm font-semibold text-green-600 ml-2">Hotel Booking Saved</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleSaveHotelBooking}
                      disabled={isSavingBooking}
                      className={`rounded-lg py-3 items-center flex-row justify-center active:opacity-80 ${isSavingBooking ? 'bg-purple-400' : 'bg-purple-600'}`}
                    >
                      <Ionicons name="bed" size={18} color="white" />
                      <Text className="text-sm font-semibold text-white ml-2">
                        {isSavingBooking ? 'Saving...' : `Save Hotel to "${activeMatch.name}"`}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            )}
          </View>
        )}

        {/* Action buttons — right after extraction/match for easy access */}
        <View className="mb-3">
          {(email.classification === 'tournament_info' ||
            email.classification === 'schedule_change' ||
            email.classification === 'coach_announcement') && (
            <Pressable
              className="bg-rally-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
              onPress={handleExtractSchedule}
            >
              <Ionicons name="sparkles" size={18} color="#FEFEFE" />
              <Text className="text-sm font-semibold text-cream ml-2">Extract Tournaments</Text>
            </Pressable>
          )}

          {email.classification === 'stay_and_play' && (
            <Pressable
              className="bg-purple-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
              onPress={handleCreateHotelBooking}
            >
              <Ionicons name="bed" size={18} color="white" />
              <Text className="text-sm font-semibold text-white ml-2">Create Hotel Booking</Text>
            </Pressable>
          )}

          {email.classification === 'travel_confirmation' && (
            <Pressable
              className="bg-rally-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
              onPress={handleCreateFlightBooking}
            >
              <Ionicons name="airplane" size={18} color="white" />
              <Text className="text-sm font-semibold text-white ml-2">Create Flight Booking</Text>
            </Pressable>
          )}

          <Pressable
            className={`rounded-xl py-3.5 items-center flex-row justify-center ${hasExtractedData ? 'bg-warm-white dark:bg-bark-light border border-parchment dark:border-rally-900' : 'bg-rally-600'} ${isReExtracting ? 'opacity-60' : 'active:opacity-80'}`}
            onPress={handleReExtract}
            disabled={isReExtracting}
          >
            <Ionicons name="sparkles" size={18} color={hasExtractedData ? ic.muted : '#FEFEFE'} />
            <Text className={`text-sm font-semibold ml-2 ${hasExtractedData ? 'text-stone dark:text-parchment' : 'text-cream'}`}>
              {isReExtracting ? 'Extracting...' : hasExtractedData ? 'Re-extract with AI' : 'Extract Details'}
            </Text>
          </Pressable>
        </View>

        {/* Email body — collapsed by default, below actions */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-4 border border-parchment dark:border-rally-900">
          <Text className="text-xs text-stone uppercase tracking-wider mb-2">Email Body</Text>
          <Text className="text-sm text-bark dark:text-parchment leading-5" selectable>
            {displayBody}{bodyIsLong && !showFullBody ? '...' : ''}
          </Text>
          {bodyIsLong && (
            <Pressable onPress={() => setShowFullBody(!showFullBody)} className="mt-3 active:opacity-70">
              <Text className="text-sm font-semibold text-rally-600">
                {showFullBody ? 'Show less' : 'Show full email'}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
