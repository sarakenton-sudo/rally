import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { classifyEmail } from '../_shared/classify-email.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  envelopeFrom?: string; // The actual forwarder (from SendGrid envelope)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse inbound email (supports SendGrid/Postmark/Mailgun webhook format)
    let email: InboundEmail;
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      // SendGrid inbound parse format
      const formData = await req.formData();

      // SendGrid sends an "envelope" field as JSON string: {"to":["plans@rally-hub.com"],"from":"forwarder@gmail.com"}
      // The envelope.from is the ACTUAL person who forwarded the email (not the original sender like Marriott/Delta)
      let envelopeFrom = '';
      const envelopeRaw = formData.get('envelope') as string;
      if (envelopeRaw) {
        try {
          const envelope = JSON.parse(envelopeRaw);
          envelopeFrom = envelope.from ?? '';
          console.log(`[process-email] Envelope from: ${envelopeFrom}`);
        } catch {
          console.warn('[process-email] Failed to parse envelope JSON');
        }
      }

      email = {
        from: formData.get('from') as string ?? '',
        to: formData.get('to') as string ?? '',
        subject: formData.get('subject') as string ?? '',
        text: formData.get('text') as string ?? '',
        html: formData.get('html') as string ?? undefined,
        envelopeFrom,
      };
    } else {
      // JSON format (Postmark or direct API call)
      const body = await req.json();
      email = {
        from: body.From ?? body.from ?? '',
        to: body.To ?? body.to ?? '',
        subject: body.Subject ?? body.subject ?? '',
        text: body.TextBody ?? body.text ?? '',
        html: body.HtmlBody ?? body.html ?? undefined,
        envelopeFrom: body.envelopeFrom ?? body.envelope_from ?? '',
      };
    }

    if (!email.to || (!email.text && !email.html)) {
      return jsonResponse({ error: 'Missing required email fields' }, 400);
    }

    // === User routing: identify who forwarded this email ===
    // Priority 1: SendGrid envelope.from — the actual forwarder's email
    if (email.envelopeFrom) {
      const forwarderEmail = email.envelopeFrom.toLowerCase().trim();
      console.log(`[process-email] Trying envelope-based routing for: ${forwarderEmail}`);

      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matchingUser = authUsers?.users?.find((u: any) => u.email?.toLowerCase() === forwarderEmail);
      if (matchingUser) {
        const { data: userConfig } = await supabase
          .from('admin_config')
          .select('id, user_id')
          .eq('user_id', matchingUser.id)
          .single();
        if (userConfig) {
          console.log(`[process-email] Routed via envelope to user ${matchingUser.email}`);
          return await processForUser(supabase, userConfig, email);
        }
        // Co-parent fallback: no admin_config, find primary admin via shared athletes
        const primaryConfig = await findPrimaryAdminConfig(supabase, matchingUser.id);
        if (primaryConfig) {
          console.log(`[process-email] Routed co-parent ${matchingUser.email} to primary admin ${primaryConfig.user_id}`);
          return await processForUser(supabase, primaryConfig, email);
        }
      }
      console.log(`[process-email] Envelope from "${forwarderEmail}" did not match any auth user`);
    }

    // Priority 2: Single-user fallback (most Rally installs have one admin)
    const { data: allConfigs } = await supabase
      .from('admin_config')
      .select('id, user_id')
      .limit(2);
    if (allConfigs && allConfigs.length === 1) {
      console.log(`[process-email] Single-user fallback: routing to user ${allConfigs[0].user_id}`);
      return await processForUser(supabase, allConfigs[0], email);
    }

    // Priority 3: Match the "from" header email to an auth user (works when user forwards from their own email client)
    const fromAddress = extractAddress(email.from).toLowerCase().trim();
    const { data: authUsersP3 } = await supabase.auth.admin.listUsers();
    const fromMatch = authUsersP3?.users?.find((u: any) => u.email?.toLowerCase() === fromAddress);
    if (fromMatch) {
      const { data: fromConfig } = await supabase
        .from('admin_config')
        .select('id, user_id')
        .eq('user_id', fromMatch.id)
        .single();
      if (fromConfig) {
        console.log(`[process-email] Routed via from-header to user ${fromMatch.email}`);
        return await processForUser(supabase, fromConfig, email);
      }
      // Co-parent fallback
      const primaryConfig = await findPrimaryAdminConfig(supabase, fromMatch.id);
      if (primaryConfig) {
        console.log(`[process-email] Routed co-parent ${fromMatch.email} via from-header to primary admin ${primaryConfig.user_id}`);
        return await processForUser(supabase, primaryConfig, email);
      }
    }

    console.error(`[process-email] Could not route email. From: "${email.from}", Envelope: "${email.envelopeFrom}", To: "${email.to}"`);
    return jsonResponse({ error: 'Could not identify forwarding user' }, 404);
  } catch (err) {
    console.error('Process email error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// Co-parent fallback: find the primary admin's config via shared athletes
async function findPrimaryAdminConfig(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ id: string; user_id: string } | null> {
  // Find athletes this user is linked to
  const { data: myAthletes } = await supabase
    .from('admin_athletes')
    .select('athlete_id')
    .eq('admin_id', userId);
  if (!myAthletes || myAthletes.length === 0) return null;

  // Find the primary admin for any of those athletes
  const { data: primaryAdmins } = await supabase
    .from('admin_athletes')
    .select('admin_id')
    .in('athlete_id', myAthletes.map((a: any) => a.athlete_id))
    .eq('is_primary', true)
    .neq('admin_id', userId)
    .limit(1);
  if (!primaryAdmins || primaryAdmins.length === 0) return null;

  const { data: config } = await supabase
    .from('admin_config')
    .select('id, user_id')
    .eq('user_id', primaryAdmins[0].admin_id)
    .single();
  return config ?? null;
}

async function processForUser(
  supabase: ReturnType<typeof createClient>,
  config: { id: string; user_id: string },
  email: InboundEmail,
): Promise<Response> {
  // Use HTML body for classification if available (better for extracting links/tables)
  const bodyForClassify = email.html ?? email.text;

  // Classify the email with Claude
  const { classification, action, summary, extractedData } = await classifyEmail(
    CLAUDE_API_KEY,
    email.from,
    email.subject,
    bodyForClassify,
  );

  console.log(`[process-email] Classified "${email.subject}" as: ${classification}`);

  // Store the email (including "other" — user forwarded it intentionally)
  const { data: stored, error: storeError } = await supabase
    .from('forwarded_emails')
    .insert({
      user_id: config.user_id,
      from_address: email.from,
      subject: email.subject,
      body_text: email.html ?? email.text,
      received_at: new Date().toISOString(),
      classification,
      action_taken: 'none',
      extracted_data: extractedData,
      raw_storage_url: null,
      source: 'forward',
    })
    .select()
    .single();

  if (storeError) {
    console.error('Failed to store email:', storeError);
    return jsonResponse({ error: 'Failed to store email' }, 500);
  }

  // No auto-import: user must review AI extraction and explicitly import from email detail page
  // (Previously: autoApplyToTournament was called here to auto-create bookings)

  // Trigger notifications for actionable classifications
  if (classification === 'stay_and_play' || classification === 'travel_confirmation') {
    await supabase.functions.invoke('send-notification', {
      body: {
        user_id: config.user_id,
        type: 'custom',
        title: classification === 'stay_and_play' ? 'Hotel Booking Detected' : 'Travel Confirmation Detected',
        body: summary || `New ${classification.replace('_', ' ')} email from ${email.from}: "${email.subject}"`,
        data: { emailId: stored.id, extractedData },
      },
    });
  } else if (classification === 'schedule_change') {
    await supabase.functions.invoke('send-notification', {
      body: {
        user_id: config.user_id,
        type: 'schedule_change',
        title: 'Schedule Change Detected',
        body: summary || `Schedule update from ${email.from}: "${email.subject}"`,
        data: { emailId: stored.id, extractedData },
      },
    });
  } else if (classification === 'coach_announcement') {
    await supabase.functions.invoke('send-notification', {
      body: {
        user_id: config.user_id,
        type: 'custom',
        title: 'Coach Announcement',
        body: summary || email.subject,
        data: { emailId: stored.id },
      },
    });
  }

  return jsonResponse({
    success: true,
    email_id: stored.id,
    classification,
    action,
    summary,
    extracted_data: extractedData,
  });
}

// Auto-apply extracted email data to matching tournaments
async function autoApplyToTournament(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  classification: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!['tournament_info', 'schedule_change', 'stay_and_play', 'travel_confirmation'].includes(classification)) return;

  try {
    // Get user's tournaments through admin_athletes → athletes → seasons
    const { data: adminAthletes } = await supabase
      .from('admin_athletes')
      .select('athlete_id')
      .eq('admin_id', userId);
    const athleteIds = (adminAthletes ?? []).map((r: any) => r.athlete_id);
    if (athleteIds.length === 0) return;

    const { data: seasons } = await supabase
      .from('seasons')
      .select('id')
      .in('athlete_id', athleteIds);
    const seasonIds = (seasons ?? []).map((s: any) => s.id);
    if (seasonIds.length === 0) return;

    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name, start_date, end_date, schedule_link, schedule_available_date, ticket_sales_date, ticket_link, venues, season_id')
      .in('season_id', seasonIds);
    if (!tournaments || tournaments.length === 0) return;

    // For travel emails, upsert bookings (update existing or create new)
    if (classification === 'travel_confirmation') {
      const departureDate = String(data.departure_date ?? (data.outbound as any)?.departure_date ?? '');
      const confCode = String(data.confirmation_number ?? data.confirmation_code ?? '');
      const match = findNearestTournament(tournaments, departureDate, String(data.tournament_name ?? ''));
      if (!match) return;

      // Check for existing flight booking — match by confirmation code + passenger name
      // (Family members often share a confirmation code, so we need passenger-aware matching)
      const passengerName = String(data.passenger_name ?? '').toUpperCase().trim();
      let existingFlights: any[] | null = null;

      if (confCode) {
        const { data: candidates } = await supabase
          .from('flight_bookings')
          .select('id, airline, confirmation_code, departure_date, return_date, departure_time, arrival_time, seat_number, flight_number, ticket_number, cost, booked_by, traveler_names')
          .eq('confirmation_code', confCode)
          .eq('created_by_user_id', userId);

        if (candidates && candidates.length > 0 && passengerName) {
          // Find one matching this specific passenger
          const passengerMatch = candidates.find((f: any) => {
            const bookedBy = String(f.booked_by ?? '').toUpperCase().trim();
            const travelers = (f.traveler_names ?? []).map((t: string) => t.toUpperCase().trim());
            return bookedBy === passengerName || travelers.includes(passengerName);
          });
          existingFlights = passengerMatch ? [passengerMatch] : null;
        } else {
          existingFlights = candidates;
        }
      }

      // Fallback: check by tournament if no conf code match
      if (!existingFlights || existingFlights.length === 0) {
        const { data: tourneyFlights } = await supabase
          .from('flight_bookings')
          .select('id, airline, confirmation_code, departure_date, return_date, departure_time, arrival_time, seat_number, flight_number, ticket_number, cost, booked_by, traveler_names')
          .eq('tournament_id', match.id)
          .eq('created_by_user_id', userId);

        if (tourneyFlights && tourneyFlights.length > 0 && passengerName) {
          const passengerMatch = tourneyFlights.find((f: any) => {
            const bookedBy = String(f.booked_by ?? '').toUpperCase().trim();
            const travelers = (f.traveler_names ?? []).map((t: string) => t.toUpperCase().trim());
            return bookedBy === passengerName || travelers.includes(passengerName);
          });
          // Only match tournament flights without a conf code (avoid overwriting a different booking)
          if (passengerMatch) {
            existingFlights = [passengerMatch];
          } else if (tourneyFlights.some((f: any) => !f.confirmation_code)) {
            existingFlights = [tourneyFlights.find((f: any) => !f.confirmation_code)];
          }
        } else if (tourneyFlights && tourneyFlights.length > 0) {
          existingFlights = tourneyFlights.length === 1 ? tourneyFlights : null;
        }
      }

      const newData: Record<string, unknown> = {
        airline: String(data.airline ?? '') || undefined,
        confirmation_code: confCode || undefined,
        departure_date: departureDate || undefined,
        return_date: String(data.return_date ?? (data.return as any)?.departure_date ?? '') || undefined,
        booked_by: String(data.passenger_name ?? '') || undefined,
        traveler_names: data.passenger_name ? [String(data.passenger_name)] : undefined,
        cost: data.total_cost ? Number(data.total_cost) : undefined,
        ticket_number: String(data.ticket_number ?? '') || undefined,
        departure_time: String(data.departure_time ?? (data.outbound as any)?.departure_time ?? '') || undefined,
        arrival_time: String(data.arrival_time ?? (data.outbound as any)?.arrival_time ?? '') || undefined,
        seat_number: String(data.seat_number ?? (data.outbound as any)?.seat_number ?? '') || undefined,
        flight_number: String(data.flight_number ?? (data.outbound as any)?.flight_number ?? '') || undefined,
      };

      if (existingFlights && existingFlights.length > 0) {
        // Update only empty fields
        const existing = existingFlights[0] as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(newData)) {
          if (val === undefined) continue;
          const cur = existing[key];
          if (!cur || cur === '' || cur === null) updates[key] = val;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('flight_bookings').update(updates).eq('id', existing.id);
          console.log(`Auto-updated flight booking for "${match.name}":`, Object.keys(updates));
        } else {
          console.log(`Flight booking for "${match.name}" already up to date`);
        }
      } else {
        const clean = Object.fromEntries(Object.entries(newData).filter(([_, v]) => v !== undefined));
        const { error } = await supabase.from('flight_bookings').insert({
          tournament_id: match.id,
          created_by_user_id: userId,
          airline: '',
          confirmation_code: '',
          departure_date: null,
          return_date: null,
          booked_by: '',
          traveler_names: [],
          cost: null,
          ticket_number: '',
          ...clean,
        });
        if (error) console.error('Auto-create flight booking failed:', error);
        else console.log(`Auto-created flight booking for tournament "${match.name}"`);
      }
      return;
    }

    if (classification === 'stay_and_play') {
      const checkInDate = String(data.check_in_date ?? '');
      const confNum = String(data.confirmation_number ?? data.reservation_number ?? '');
      const match = findNearestTournament(tournaments, checkInDate, String(data.tournament_name ?? ''));
      if (!match) return;

      // Check for existing hotel booking (by reservation number, then tournament)
      let existingHotels: any[] | null = null;
      if (confNum) {
        const { data: confMatch } = await supabase
          .from('hotel_bookings')
          .select('id, hotel_name, reservation_number, check_in, check_out, cancellation_deadline, cost, address, booked_by')
          .eq('reservation_number', confNum)
          .eq('created_by_user_id', userId)
          .limit(1);
        existingHotels = confMatch;
      }
      if (!existingHotels || existingHotels.length === 0) {
        const { data: tourneyMatch } = await supabase
          .from('hotel_bookings')
          .select('id, hotel_name, reservation_number, check_in, check_out, cancellation_deadline, cost, address, booked_by')
          .eq('tournament_id', match.id)
          .eq('created_by_user_id', userId)
          .limit(1);
        existingHotels = tourneyMatch;
      }

      const newData: Record<string, unknown> = {
        hotel_name: String(data.hotel_name ?? '') || undefined,
        booking_name: String(data.hotel_name ?? '') || undefined,
        reservation_number: confNum || undefined,
        check_in: checkInDate || undefined,
        check_out: String(data.check_out_date ?? '') || undefined,
        cancellation_deadline: String(data.cancellation_deadline ?? '') || undefined,
        cost: data.total_cost ? Number(data.total_cost) : (data.nightly_rate ? Number(data.nightly_rate) : undefined),
        address: String(data.address ?? data.hotel_address ?? '') || undefined,
      };

      if (existingHotels && existingHotels.length > 0) {
        const existing = existingHotels[0] as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(newData)) {
          if (val === undefined) continue;
          const cur = existing[key];
          if (!cur || cur === '' || cur === null) updates[key] = val;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('hotel_bookings').update(updates).eq('id', existing.id);
          console.log(`Auto-updated hotel booking for "${match.name}":`, Object.keys(updates));
        } else {
          console.log(`Hotel booking for "${match.name}" already up to date`);
        }
      } else {
        const clean = Object.fromEntries(Object.entries(newData).filter(([_, v]) => v !== undefined));
        const { error } = await supabase.from('hotel_bookings').insert({
          tournament_id: match.id,
          created_by_user_id: userId,
          hotel_name: '',
          platform: 'Other',
          booking_name: '',
          booked_by: '',
          reservation_number: '',
          check_in: null,
          check_out: null,
          cancellation_deadline: null,
          cost: null,
          is_backup: false,
          status: 'confirmed',
          ...clean,
        });
        if (error) console.error('Auto-create hotel booking failed:', error);
        else console.log(`Auto-created hotel booking for tournament "${match.name}"`);
      }
    }

    // Tournament info / schedule updates — update tournament fields
    const tournamentName = String(data.tournament_name ?? '').toLowerCase();
    const startDate = String(data.start_date ?? '');
    if (!tournamentName && !startDate) return;

    const match = findNearestTournament(tournaments, startDate, tournamentName);
    if (!match) return;

    const updates: Record<string, unknown> = {};
    if (!match.schedule_link && data.schedule_url) updates.schedule_link = data.schedule_url;
    if (!match.schedule_available_date && data.schedule_available_date) updates.schedule_available_date = data.schedule_available_date;
    if (!match.ticket_sales_date && data.ticket_sales_date) updates.ticket_sales_date = data.ticket_sales_date;
    if (!match.ticket_link && data.ticket_url) updates.ticket_link = data.ticket_url;
    if (data.venue_address && Array.isArray(match.venues) && match.venues.length === 0) {
      updates.venues = [{
        label: String(data.venue_name ?? ''),
        address: String(data.venue_address),
        is_confirmed: false,
      }];
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('tournaments').update(updates).eq('id', match.id);
      console.log(`Auto-applied to tournament "${match.name}":`, Object.keys(updates));
    }
  } catch (err) {
    console.error('Auto-apply to tournament failed:', err);
  }
}

function findNearestTournament(
  tournaments: Array<Record<string, unknown>>,
  travelDate: string,
  tournamentName?: string,
): Record<string, unknown> | undefined {
  // Try name match first
  if (tournamentName) {
    const nameLower = tournamentName.toLowerCase();
    const nameMatch = tournaments.find((t) => {
      const tName = String(t.name ?? '').toLowerCase();
      const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length > 3);
      const matchingWords = nameWords.filter((w: string) => tName.includes(w));
      return matchingWords.length >= 2 || tName.includes(nameLower) || nameLower.includes(tName);
    });
    if (nameMatch) return nameMatch;
  }

  // Fall back to nearest by date (within 5 days)
  if (!travelDate) return undefined;
  const fiveDays = 5 * 24 * 60 * 60 * 1000;
  let best: Record<string, unknown> | undefined;
  let bestDiff = Infinity;

  for (const t of tournaments) {
    const diffStart = Math.abs(new Date(travelDate).getTime() - new Date(String(t.start_date)).getTime());
    const diffEnd = Math.abs(new Date(travelDate).getTime() - new Date(String(t.end_date)).getTime());
    const minDiff = Math.min(diffStart, diffEnd);
    if (minDiff <= fiveDays && minDiff < bestDiff) {
      bestDiff = minDiff;
      best = t;
    }
  }
  return best;
}

function extractAddress(to: string): string {
  const match = to.match(/<([^>]+)>/);
  return match ? match[1] : to.trim();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
