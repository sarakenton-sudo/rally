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
      email = {
        from: formData.get('from') as string ?? '',
        to: formData.get('to') as string ?? '',
        subject: formData.get('subject') as string ?? '',
        text: formData.get('text') as string ?? '',
        html: formData.get('html') as string ?? undefined,
      };
    } else {
      // JSON format (Postmark or direct API call)
      const body = await req.json();
      // Postmark format uses different field names
      email = {
        from: body.From ?? body.from ?? '',
        to: body.To ?? body.to ?? '',
        subject: body.Subject ?? body.subject ?? '',
        text: body.TextBody ?? body.text ?? '',
        html: body.HtmlBody ?? body.html ?? undefined,
      };
    }

    if (!email.to || (!email.text && !email.html)) {
      return jsonResponse({ error: 'Missing required email fields' }, 400);
    }

    // Look up the team by Rally forward address
    const forwardAddress = extractAddress(email.to);
    const { data: config } = await supabase
      .from('admin_config')
      .select('id, user_id')
      .eq('rally_forward_address', forwardAddress)
      .single();

    if (!config) {
      // Fallback: try matching by the generic plans@rally.app address
      // In this case, try to identify user from the "from" address
      const fromAddress = extractAddress(email.from);
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matchingUser = authUsers?.users?.find((u: any) => u.email === fromAddress);
      if (!matchingUser) {
        console.error(`No user found for forward address ${forwardAddress} or from address ${fromAddress}`);
        return jsonResponse({ error: 'No team found for this forward address' }, 404);
      }
      // Use this user's config
      const { data: userConfig } = await supabase
        .from('admin_config')
        .select('id, user_id')
        .eq('user_id', matchingUser.id)
        .single();
      if (!userConfig) {
        return jsonResponse({ error: 'User has no config' }, 404);
      }
      return await processForUser(supabase, userConfig, email);
    }

    return await processForUser(supabase, config, email);
  } catch (err) {
    console.error('Process email error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

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
      action_taken: action,
      extracted_data: extractedData,
      raw_storage_url: null,
      source: 'forwarded',
    })
    .select()
    .single();

  if (storeError) {
    console.error('Failed to store email:', storeError);
    return jsonResponse({ error: 'Failed to store email' }, 500);
  }

  // Auto-apply extracted data to matching tournaments
  await autoApplyToTournament(supabase, config.user_id, classification, extractedData);

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

    // For travel emails, auto-create bookings
    if (classification === 'travel_confirmation') {
      const departureDate = String(data.departure_date ?? (data.outbound as any)?.departure_date ?? '');
      const match = findNearestTournament(tournaments, departureDate, String(data.tournament_name ?? ''));
      if (!match) return;

      const returnDate = String(data.return_date ?? (data.return as any)?.departure_date ?? '');
      const { error } = await supabase
        .from('flight_bookings')
        .insert({
          tournament_id: match.id,
          created_by_user_id: userId,
          airline: String(data.airline ?? ''),
          confirmation_code: String(data.confirmation_number ?? ''),
          departure_date: departureDate || null,
          return_date: returnDate || null,
          booked_by: String(data.passenger_name ?? ''),
          traveler_names: data.passenger_name ? [String(data.passenger_name)] : [],
          cost: data.total_cost ? Number(data.total_cost) : null,
          ticket_number: '',
        });
      if (error) console.error('Auto-create flight booking failed:', error);
      else console.log(`Auto-created flight booking for tournament "${match.name}"`);
      return;
    }

    if (classification === 'stay_and_play') {
      const checkInDate = String(data.check_in_date ?? '');
      const match = findNearestTournament(tournaments, checkInDate, String(data.tournament_name ?? ''));
      if (!match) return;

      const { error } = await supabase
        .from('hotel_bookings')
        .insert({
          tournament_id: match.id,
          created_by_user_id: userId,
          hotel_name: String(data.hotel_name ?? ''),
          platform: 'Other',
          booking_name: String(data.hotel_name ?? ''),
          booked_by: '',
          reservation_number: String(data.confirmation_number ?? ''),
          check_in: checkInDate || null,
          check_out: String(data.check_out_date ?? '') || null,
          cancellation_deadline: String(data.cancellation_deadline ?? '') || null,
          cost: data.total_cost ? Number(data.total_cost) : (data.nightly_rate ? Number(data.nightly_rate) : null),
          is_backup: false,
          status: 'confirmed',
        });
      if (error) console.error('Auto-create hotel booking failed:', error);
      else console.log(`Auto-created hotel booking for tournament "${match.name}"`);
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
