import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { classifyEmail } from '../_shared/classify-email.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MAX_MESSAGES_PER_SYNC = 50;
const MAX_SYNC_ERRORS = 3;

// Helper: get season IDs for a user through admin_athletes → athletes → seasons
async function getUserSeasonIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('admin_athletes')
    .select('athlete_id')
    .eq('admin_id', userId);
  if (!data || data.length === 0) return [];
  const athleteIds = data.map((r: { athlete_id: string }) => r.athlete_id);
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id')
    .in('athlete_id', athleteIds);
  return (seasons ?? []).map((s: { id: string }) => s.id);
}

// Helper: get tournaments for a user through season relationships
async function getUserTournaments(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  selectFields = 'id, name, start_date, end_date, schedule_link, schedule_available_date, ticket_sales_date, ticket_link, venues, season_id',
) {
  const seasonIds = await getUserSeasonIds(supabase, userId);
  if (seasonIds.length === 0) return [];
  const { data } = await supabase
    .from('tournaments')
    .select(selectFields)
    .in('season_id', seasonIds);
  return data ?? [];
}


interface GmailToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  gmail_email: string;
  last_sync_at: string | null;
  last_history_id: string | null;
  sync_errors: number;
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  payload: GmailPart & {
    headers: Array<{ name: string; value: string }>;
  };
  snippet: string;
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);
  const forceReset = url.searchParams.get('reset') === 'true';
  const diagnose = url.searchParams.get('diagnose') === 'true';

  // Quick diagnostic mode — show DB state without syncing
  if (diagnose) {
    const { data: emails } = await supabase.from('forwarded_emails').select('user_id').limit(200);
    const emailsByUser: Record<string, number> = {};
    (emails ?? []).forEach((e: any) => { emailsByUser[e.user_id] = (emailsByUser[e.user_id] || 0) + 1; });

    const { data: configs } = await supabase.from('admin_config').select('user_id, gmail_connected, gmail_email');
    const { data: tokens } = await supabase.from('gmail_tokens').select('user_id, gmail_email, is_active, last_sync_at, sync_errors');
    const { data: profiles } = await supabase.from('user_profiles').select('id, role, display_name');
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const users = (authUsers?.users ?? []).map((u: any) => ({ id: u.id, email: u.email, provider: u.app_metadata?.provider }));

    // If fix param is set, reassign emails from old user to new user
    const fixFrom = url.searchParams.get('fix_from');
    const fixTo = url.searchParams.get('fix_to');
    if (fixFrom && fixTo) {
      const { data: fixed, error: fixError } = await supabase
        .from('forwarded_emails')
        .update({ user_id: fixTo })
        .eq('user_id', fixFrom);
      // Also deactivate old token
      await supabase.from('gmail_tokens').update({ is_active: false }).eq('user_id', fixFrom);
      return jsonResponse({ fixed: true, fix_error: fixError?.message ?? null, emails_by_user: emailsByUser, admin_configs: configs });
    }

    // Fetch a specific email by ID or search by subject
    const emailId = url.searchParams.get('email_id');
    const emailSearch = url.searchParams.get('email_search');
    if (emailId) {
      const { data: emailRow } = await supabase
        .from('forwarded_emails')
        .select('id, subject, from_address, classification, extracted_data, body_text')
        .eq('id', emailId)
        .single();
      if (emailRow) {
        emailRow.body_text = (emailRow.body_text ?? '').slice(0, 2000);
      }
      return jsonResponse({ email: emailRow });
    }
    if (emailSearch) {
      const { data: results } = await supabase
        .from('forwarded_emails')
        .select('id, subject, classification, extracted_data')
        .ilike('subject', `%${emailSearch}%`)
        .limit(10);
      return jsonResponse({ results: (results ?? []).map((r: any) => ({ id: r.id, subject: r.subject, classification: r.classification, fields: Object.keys(r.extracted_data ?? {}).length })) });
    }

    // Re-classify all unclassified emails with updated AI
    if (url.searchParams.get('reclassify') === 'true') {
      const { data: unclassified } = await supabase
        .from('forwarded_emails')
        .select('id, from_address, subject, body_text')
        .eq('classification', 'unclassified')
        .limit(10);
      if (!unclassified || unclassified.length === 0) {
        return jsonResponse({ reclassified: 0, message: 'No unclassified emails found' });
      }
      let reclassified = 0;
      const details: Array<{ id: string; subject: string; new_classification: string }> = [];
      for (const email of unclassified) {
        // Strip HTML to plain text before sending to classifier — large HTML bodies can cause timeouts
        let bodyForClassify = (email.body_text ?? '').slice(0, 10000);
        if (bodyForClassify.includes('<')) {
          bodyForClassify = bodyForClassify
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000);
        }
        const result = await classifyEmail(CLAUDE_API_KEY, email.from_address, email.subject, bodyForClassify);
        if (result.classification !== 'unclassified') {
          await supabase.from('forwarded_emails').update({
            classification: result.classification,
            extracted_data: result.extractedData,
            action_taken: result.action,
          }).eq('id', email.id);
          reclassified++;
        }
        details.push({ id: email.id, subject: email.subject, new_classification: result.classification });
      }
      return jsonResponse({ reclassified, total_unclassified: unclassified.length, details });
    }

    // Wipe emails only — delete all forwarded_emails so they get re-synced with updated AI
    if (url.searchParams.get('wipe_emails') === 'true') {
      const { error } = await supabase.from('forwarded_emails').delete().not('id', 'is', null);
      // Reset ALL tokens: clear sync timestamp AND reactivate any deactivated tokens
      await supabase.from('gmail_tokens').update({ last_sync_at: null, sync_errors: 0, is_active: true }).not('user_id', 'is', null);
      return jsonResponse({ wiped_emails: true, error: error?.message ?? null });
    }

    // Full reset mode — wipe all data and auth users
    if (url.searchParams.get('full_reset') === 'true') {
      // Delete data tables in dependency order
      await supabase.from('tournament_guests').delete().neq('tournament_id', '');
      await supabase.from('forwarded_emails').delete().neq('id', '');
      await supabase.from('hotel_bookings').delete().neq('id', '');
      await supabase.from('flight_bookings').delete().neq('id', '');
      await supabase.from('guests').delete().neq('id', '');
      await supabase.from('usav_profiles').delete().neq('id', '');
      await supabase.from('team_events').delete().neq('id', '');
      await supabase.from('tournaments').delete().neq('id', '');
      await supabase.from('gmail_tokens').delete().neq('user_id', '');
      await supabase.from('seasons').delete().neq('id', '');
      await supabase.from('admin_athletes').delete().neq('admin_id', '');
      await supabase.from('athletes').delete().neq('id', '');
      await supabase.from('admin_config').delete().neq('id', '');
      await supabase.from('user_profiles').delete().neq('id', '');
      await supabase.from('athlete_invites').delete().neq('id', '');

      // Delete all auth users
      const { data: authData } = await supabase.auth.admin.listUsers();
      for (const u of authData?.users ?? []) {
        await supabase.auth.admin.deleteUser(u.id);
      }

      return jsonResponse({ reset: true, deleted_users: (authData?.users ?? []).length });
    }

    return jsonResponse({ emails_by_user: emailsByUser, admin_configs: configs, gmail_tokens: tokens, user_profiles: profiles, auth_users: users });
  }

  try {
    // If reset=true, clear last_sync_at and force token refresh
    if (forceReset) {
      await supabase
        .from('gmail_tokens')
        .update({ last_sync_at: null, sync_errors: 0, is_active: true, token_expires_at: '2000-01-01T00:00:00Z' })
        .not('user_id', 'is', null);
      console.log('[gmail-sync] Reset: cleared last_sync_at, reset errors, forced token refresh');
    }

    // Fetch all active Gmail tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('is_active', true);

    if (tokensError) {
      console.error('Failed to fetch gmail_tokens:', tokensError);
      return jsonResponse({ error: 'Failed to fetch tokens' }, 500);
    }

    if (!tokens || tokens.length === 0) {
      return jsonResponse({ message: 'No active Gmail connections', synced: 0 });
    }

    const results: Array<{ user_id: string; emails_processed: number; error?: string }> = [];

    for (const token of tokens as GmailToken[]) {
      try {
        console.log(`[gmail-sync] Starting sync for user ${token.user_id}, email: ${token.gmail_email}, has_refresh_token: ${!!token.refresh_token && token.refresh_token !== ''}, token_expires_at: ${token.token_expires_at}, last_sync_at: ${token.last_sync_at}`);
        const result = await syncUser(supabase, token);
        results.push(result);
      } catch (err) {
        console.error(`Sync failed for user ${token.user_id}:`, err);
        results.push({ user_id: token.user_id, emails_processed: 0, error: String(err) });

        // Increment sync_errors
        const newErrorCount = token.sync_errors + 1;
        await supabase
          .from('gmail_tokens')
          .update({
            sync_errors: newErrorCount,
            is_active: newErrorCount < MAX_SYNC_ERRORS,
          })
          .eq('user_id', token.user_id);
      }
    }

    // Proactive notifications: check if schedule/ticket dates arrived today
    const today = new Date().toISOString().split('T')[0];
    await checkScheduleAndTicketDates(supabase, today);

    // Include diagnostic info in response
    const diagnostics = (tokens as GmailToken[]).map((t) => ({
      user_id: t.user_id,
      gmail_email: t.gmail_email,
      has_refresh_token: !!t.refresh_token && t.refresh_token !== '',
      token_expires_at: t.token_expires_at,
      token_expired: new Date(t.token_expires_at) <= new Date(),
      last_sync_at: t.last_sync_at,
      sync_errors: t.sync_errors,
    }));
    return jsonResponse({
      synced: results.length,
      results,
      token_count: tokens.length,
      diagnostics,
      env_check: {
        has_claude_api_key: !!CLAUDE_API_KEY,
        has_google_client_id: !!GOOGLE_CLIENT_ID,
        has_google_client_secret: !!GOOGLE_CLIENT_SECRET,
      },
    });
  } catch (err) {
    console.error('Gmail sync error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

async function syncUser(
  supabase: ReturnType<typeof createClient>,
  token: GmailToken,
): Promise<{ user_id: string; emails_processed: number; gmail_messages_found?: number; already_processed?: number; token_refreshed?: boolean; error?: string }> {
  // Refresh access token if expired
  let accessToken = token.access_token;
  const expiresAt = new Date(token.token_expires_at);
  let tokenRefreshed = false;

  if (expiresAt <= new Date()) {
    console.log(`[gmail-sync] Token expired (${token.token_expires_at}), refreshing...`);
    accessToken = await refreshAccessToken(supabase, token);
    tokenRefreshed = true;
    console.log(`[gmail-sync] Token refreshed successfully`);
  }

  // Fetch admin_config for sender filters
  const { data: config } = await supabase
    .from('admin_config')
    .select('trusted_sender_emails, travel_sync_emails')
    .eq('user_id', token.user_id)
    .single();

  // Fetch club name and team name from user's seasons for search keywords
  const { data: adminAthletes } = await supabase
    .from('admin_athletes')
    .select('athlete_id')
    .eq('admin_id', token.user_id);
  const athleteIds = (adminAthletes ?? []).map((r: { athlete_id: string }) => r.athlete_id);
  let clubName = '';
  let teamName = '';
  if (athleteIds.length > 0) {
    const { data: seasons } = await supabase
      .from('seasons')
      .select('team_name, club_name')
      .in('athlete_id', athleteIds)
      .eq('is_active', true)
      .limit(1);
    if (seasons && seasons.length > 0) {
      clubName = seasons[0].club_name ?? '';
      teamName = seasons[0].team_name ?? '';
    }
  }

  // Build Gmail search query
  const afterEpoch = token.last_sync_at
    ? Math.floor(new Date(token.last_sync_at).getTime() / 1000)
    : Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000); // First sync: go back 1 year

  // Build search strategies:
  // 1. Travel brand domains — booking/confirmation emails
  // 2. Tournament/volleyball keywords — from any sender
  // 3. Club/team name — catches org-specific emails
  // 4. VIP/trusted senders — everything from these people
  const userVipSenders = config?.trusted_sender_emails ?? [];
  const userTravelSenders = config?.travel_sync_emails ?? [];

  // Exclude obvious spam — but NOT unsubscribe (tournament emails have that too)
  const excludeMarketing = '-subject:"limited time" -subject:"% off" -subject:"bonus points" -subject:"credit card" -subject:"earn miles" -subject:"upgrade your card" -label:promotions -label:social -category:promotions -category:social';

  // Travel brand senders — airlines, hotels, OTAs
  const travelBrands = [
    // Airlines
    'delta.com', 'united.com', 'aa.com', 'southwest.com', 'jetblue.com', 'spirit.com',
    'frontier.com', 'allegiantair.com', 'alaskaair.com', 'hawaiianairlines.com', 'sun-country.com',
    // Hotels
    'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'wyndham.com', 'choicehotels.com',
    'bestwestern.com', 'accor.com', 'radissonhotels.com', 'omnihotels.com', 'sonesta.com',
    'fourseasons.com', 'extendedstayamerica.com', 'drury-hotels.com', 'laQuintainn.com',
    'hamptoninn.com', 'holidayinn.com', 'crowneplaza.com', 'staybridge.com',
    // OTAs & Travel
    'expedia.com', 'hotels.com', 'booking.com', 'priceline.com', 'kayak.com',
    'tripadvisor.com', 'hotwire.com', 'orbitz.com', 'travelocity.com',
    'airbnb.com', 'vrbo.com', 'homeaway.com',
    // Volleyball orgs
    'leagueapps.com', 'sportsengine.com', 'teamsnap.com', 'aesathletics.com',
    'usavolleyball.org', 'jvavolleyball.org', 'avca.org',
  ];
  const brandClauses = travelBrands.map((d) => `from:${d}`).join(' OR ');

  // Booking subject keywords
  const bookingSubjects = 'subject:confirmation OR subject:itinerary OR subject:"e-ticket" OR subject:"booking confirmation" OR subject:"reservation confirmation" OR subject:"flight receipt" OR subject:"trip confirmation" OR subject:"your trip" OR subject:"your reservation"';

  // Tournament/event keywords — catch emails from any organizer
  const tournamentKeywords = '"tournament" OR "pool play" OR "bracket" OR "court assignment" OR "wave" OR "stay and play" OR "stay-and-play" OR "team check-in" OR "qualifier" OR "volleyball" OR "spectator tickets"';

  let query = `after:${afterEpoch} ${excludeMarketing} (`;
  // Travel brand senders (airlines, hotels, OTAs, volleyball orgs)
  query += `(${brandClauses})`;
  // Booking confirmation subject keywords from any sender
  query += ` OR (${bookingSubjects})`;
  // Tournament/event emails from anyone
  query += ` OR (${tournamentKeywords})`;

  // Club name and team name — catch org-specific emails
  if (clubName) {
    query += ` OR "${clubName}"`;
  }
  if (teamName && teamName !== clubName) {
    query += ` OR "${teamName}"`;
  }

  // VIP senders — get everything from these (coach messages, etc.)
  const vipSenders = [...userVipSenders, ...userTravelSenders];
  if (vipSenders.length > 0) {
    const vipClauses = vipSenders.map((e: string) => `from:${e}`).join(' OR ');
    query += ` OR {${vipClauses}}`;
  }
  query += `)`;

  // List messages matching the query
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_MESSAGES_PER_SYNC}`;
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    throw new Error(`Gmail list failed (${listResponse.status}): ${errorText}`);
  }

  const listData = await listResponse.json();
  const messageIds: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

  console.log(`[gmail-sync] Gmail search returned ${messageIds.length} messages for user ${token.user_id}. Query: ${query.substring(0, 200)}...`);

  if (messageIds.length === 0) {
    // Update last_sync_at even when no new messages
    await supabase
      .from('gmail_tokens')
      .update({ last_sync_at: new Date().toISOString(), sync_errors: 0 })
      .eq('user_id', token.user_id);
    return { user_id: token.user_id, emails_processed: 0, gmail_messages_found: 0, token_refreshed: tokenRefreshed, query_preview: query.substring(0, 300) };
  }

  // Check which messages are already processed
  const { data: existing } = await supabase
    .from('forwarded_emails')
    .select('gmail_message_id')
    .in('gmail_message_id', messageIds);

  const existingIds = new Set((existing ?? []).map((e: { gmail_message_id: string }) => e.gmail_message_id));
  const newMessageIds = messageIds.filter((id) => !existingIds.has(id));

  console.log(`[gmail-sync] ${messageIds.length} total, ${existingIds.size} already processed, ${newMessageIds.length} new messages to process`);

  let processed = 0;
  let lastStoreError: string | null = null;
  let skippedOther = 0;
  let skippedTravel = 0;
  let fetchFailed = 0;
  let classifyFailed = 0;
  let storeFailed = 0;

  // Limit to 10 messages per sync to avoid edge function timeout
  const toProcess = newMessageIds.slice(0, 10);
  console.log(`[gmail-sync] Processing ${toProcess.length} of ${newMessageIds.length} new messages`);

  for (const msgId of toProcess) {
    try {
      // Fetch full message
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!msgResponse.ok) {
        console.error(`[gmail-sync] Gmail fetch failed for ${msgId}: ${msgResponse.status}`);
        fetchFailed++;
        continue;
      }

      const msg: GmailMessage = await msgResponse.json();
      const from = getHeader(msg, 'From') ?? '';
      const subject = getHeader(msg, 'Subject') ?? '';
      const body = extractBody(msg);

      // Classify with Claude
      const { classification, action, summary, extractedData } = await classifyEmail(
        CLAUDE_API_KEY,
        from,
        subject,
        body,
      );

      console.log(`[gmail-sync] Classified "${subject}" from ${from} as: ${classification}`);

      // Skip marketing / irrelevant emails — don't store "other"
      if (classification === 'other') {
        console.log(`Skipping irrelevant email: "${subject}" from ${from}`);
        skippedOther++;
        continue;
      }

      // For travel emails, check if extracted dates are near a tournament (±3 days)
      // Only filter when we actually have a date — pass through if no date extracted
      if (classification === 'stay_and_play' || classification === 'travel_confirmation') {
        const travelDate = String(extractedData.check_in_date ?? extractedData.departure_date ?? extractedData.start_date ?? '');
        if (travelDate) {
          const tournamentDates = await getTournamentDates(supabase, token.user_id);
          if (tournamentDates.length > 0) {
            const isNearTournament = tournamentDates.some((td) => {
              const diffStart = Math.abs(new Date(travelDate).getTime() - new Date(td.start).getTime());
              const diffEnd = Math.abs(new Date(travelDate).getTime() - new Date(td.end).getTime());
              const fiveDays = 5 * 24 * 60 * 60 * 1000;
              return diffStart <= fiveDays || diffEnd <= fiveDays;
            });
            if (!isNearTournament) {
              console.log(`Skipping travel email not near any tournament: "${subject}" (travel date: ${travelDate})`);
              skippedTravel++;
              continue;
            }
          }
        }
      }

      // Store in forwarded_emails
      const { data: stored, error: storeError } = await supabase
        .from('forwarded_emails')
        .insert({
          user_id: token.user_id,
          from_address: from,
          subject,
          body_text: body,
          received_at: new Date().toISOString(),
          classification,
          action_taken: action,
          raw_storage_url: null,
          source: 'gmail_sync',
          gmail_message_id: msgId,
          extracted_data: extractedData,
        })
        .select()
        .single();

      if (storeError) {
        console.error(`[gmail-sync] Failed to store email ${msgId}:`, JSON.stringify(storeError));
        if (!lastStoreError) lastStoreError = storeError.message || JSON.stringify(storeError);
        storeFailed++;
        continue;
      }

      // Auto-apply extracted data to matching tournaments
      await autoApplyToTournament(supabase, token.user_id, classification, extractedData);

      // Trigger notifications for actionable classifications
      if (classification === 'stay_and_play' || classification === 'travel_confirmation') {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: token.user_id,
            type: 'custom',
            title: classification === 'stay_and_play' ? 'Hotel Booking Detected' : 'Travel Confirmation Detected',
            body: summary || `New ${classification.replace('_', ' ')} from ${from}: "${subject}"`,
            data: { emailId: stored.id, extractedData },
          },
        });
      } else if (classification === 'schedule_change') {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: token.user_id,
            type: 'schedule_change',
            title: 'Schedule Change Detected',
            body: summary || `Schedule update from ${from}: "${subject}"`,
            data: { emailId: stored.id, extractedData },
          },
        });
      } else if (classification === 'coach_announcement') {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: token.user_id,
            type: 'custom',
            title: 'Coach Announcement',
            body: summary || subject,
            data: { emailId: stored.id },
          },
        });
      }

      processed++;
    } catch (err) {
      console.error(`[gmail-sync] Failed to process message ${msgId}:`, err);
      classifyFailed++;
    }
  }

  // Only update last_sync_at if we processed ALL new messages (no more in the backlog)
  // Otherwise keep last_sync_at so the next sync picks up remaining messages
  if (newMessageIds.length <= toProcess.length) {
    await supabase
      .from('gmail_tokens')
      .update({ last_sync_at: new Date().toISOString(), sync_errors: 0 })
      .eq('user_id', token.user_id);
  } else {
    // Still reset errors but don't advance the sync timestamp
    await supabase
      .from('gmail_tokens')
      .update({ sync_errors: 0 })
      .eq('user_id', token.user_id);
    console.log(`[gmail-sync] ${newMessageIds.length - toProcess.length} messages remaining in backlog for user ${token.user_id}`);
  }

  return {
    user_id: token.user_id,
    emails_processed: processed,
    gmail_messages_found: messageIds.length,
    already_processed: existingIds.size,
    attempted: toProcess.length,
    token_refreshed: tokenRefreshed,
    skipped_other: skippedOther,
    skipped_travel_date: skippedTravel,
    fetch_failed: fetchFailed,
    classify_failed: classifyFailed,
    store_failed: storeFailed,
    last_store_error: lastStoreError,
  };
}

// Auto-apply extracted email data to matching tournaments
// Find the nearest tournament to a travel date
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
  const threeDays = 5 * 24 * 60 * 60 * 1000;
  let best: Record<string, unknown> | undefined;
  let bestDiff = Infinity;

  for (const t of tournaments) {
    const diffStart = Math.abs(new Date(travelDate).getTime() - new Date(String(t.start_date)).getTime());
    const diffEnd = Math.abs(new Date(travelDate).getTime() - new Date(String(t.end_date)).getTime());
    const minDiff = Math.min(diffStart, diffEnd);
    if (minDiff <= threeDays && minDiff < bestDiff) {
      bestDiff = minDiff;
      best = t;
    }
  }
  return best;
}

async function autoApplyToTournament(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  classification: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!['tournament_info', 'schedule_change', 'stay_and_play', 'travel_confirmation'].includes(classification)) return;

  try {
    // Fetch user's tournaments through season relationships
    const tournaments = await getUserTournaments(supabase, userId);
    if (tournaments.length === 0) return;

    // For travel emails, match by travel date to nearest tournament
    if (classification === 'travel_confirmation') {
      const departureDate = String(data.departure_date ?? data.outbound?.departure_date ?? '');
      const match = findNearestTournament(tournaments, departureDate, String(data.tournament_name ?? ''));
      if (!match) return;

      // Auto-create flight booking
      const returnDate = String(data.return_date ?? data.return?.departure_date ?? '');
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
      if (error) {
        console.error('Auto-create flight booking failed:', error);
      } else {
        console.log(`Auto-created flight booking for tournament "${match.name}"`);
      }
      return;
    }

    if (classification === 'stay_and_play') {
      const checkInDate = String(data.check_in_date ?? '');
      const match = findNearestTournament(tournaments, checkInDate, String(data.tournament_name ?? ''));
      if (!match) return;

      // Auto-create hotel booking
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
      if (error) {
        console.error('Auto-create hotel booking failed:', error);
      } else {
        console.log(`Auto-created hotel booking for tournament "${match.name}"`);
      }
      // Also update tournament fields
    }

    // Tournament info / schedule updates
    const tournamentName = String(data.tournament_name ?? '').toLowerCase();
    const startDate = String(data.start_date ?? '');
    if (!tournamentName && !startDate) return;

    const match = findNearestTournament(tournaments, startDate, tournamentName);
    if (!match) return;

    const updates: Record<string, unknown> = {};

    if (!match.schedule_link && data.schedule_url) {
      updates.schedule_link = data.schedule_url;
    }
    if (!match.schedule_available_date && data.schedule_available_date) {
      updates.schedule_available_date = data.schedule_available_date;
    }
    if (!match.ticket_sales_date && data.ticket_sales_date) {
      updates.ticket_sales_date = data.ticket_sales_date;
    }
    if (!match.ticket_link && data.ticket_url) {
      updates.ticket_link = data.ticket_url;
    }
    if (data.venue_address && Array.isArray(match.venues) && match.venues.length === 0) {
      updates.venues = [{
        label: String(data.venue_name ?? ''),
        address: String(data.venue_address),
        is_confirmed: false,
      }];
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('tournaments')
        .update(updates)
        .eq('id', match.id);
      console.log(`Auto-applied to tournament "${match.name}":`, Object.keys(updates));
    }
  } catch (err) {
    console.error('Auto-apply to tournament failed:', err);
  }
}

// Cache tournament dates per user to avoid repeated DB calls
const tournamentDateCache = new Map<string, { start: string; end: string }[]>();

async function getTournamentDates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ start: string; end: string }[]> {
  if (tournamentDateCache.has(userId)) {
    return tournamentDateCache.get(userId)!;
  }
  const seasonIds = await getUserSeasonIds(supabase, userId);
  const { data } = seasonIds.length > 0
    ? await supabase.from('tournaments').select('start_date, end_date').in('season_id', seasonIds)
    : { data: [] };
  const dates = (data ?? []).map((t: { start_date: string; end_date: string }) => ({
    start: t.start_date,
    end: t.end_date,
  }));
  tournamentDateCache.set(userId, dates);
  return dates;
}

async function checkScheduleAndTicketDates(
  supabase: ReturnType<typeof createClient>,
  today: string,
): Promise<void> {
  try {
    // Find tournaments where schedule_available_date or ticket_sales_date is today
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name, schedule_available_date, ticket_sales_date, season_id, seasons!inner(athlete_id, athletes!inner(admin_athletes!inner(admin_id)))')
      .or(`schedule_available_date.eq.${today},ticket_sales_date.eq.${today}`);

    if (!tournaments || tournaments.length === 0) return;

    for (const t of tournaments as any[]) {
      // Get admin user_id from the relationship chain
      const adminId = t.seasons?.athletes?.admin_athletes?.[0]?.admin_id;
      if (!adminId) continue;

      if (t.schedule_available_date === today) {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: adminId,
            type: 'custom',
            title: `Schedule Posted: ${t.name}`,
            body: `The schedule for ${t.name} should be available now! Check your schedule link or AES for pool assignments.`,
            data: { tournamentId: t.id },
          },
        });
        console.log(`Sent schedule notification for ${t.name}`);
      }

      if (t.ticket_sales_date === today) {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: adminId,
            type: 'custom',
            title: `Tickets On Sale: ${t.name}`,
            body: `Tickets for ${t.name} should be on sale now! Don't forget to buy before they sell out.`,
            data: { tournamentId: t.id },
          },
        });
        console.log(`Sent ticket sales notification for ${t.name}`);
      }
    }
  } catch (err) {
    console.error('Schedule/ticket date check failed:', err);
  }
}

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  token: GmailToken,
): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[gmail-sync] Token refresh failed for user ${token.user_id}: ${errorText}`);
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in ?? 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await supabase
    .from('gmail_tokens')
    .update({ access_token: newAccessToken, token_expires_at: newExpiresAt })
    .eq('user_id', token.user_id);

  return newAccessToken;
}

function getHeader(msg: GmailMessage, name: string): string | undefined {
  return msg.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function findPart(parts: GmailPart[] | undefined, mimeType: string): GmailPart | undefined {
  if (!parts) return undefined;
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) return part;
    // Recurse into nested multipart structures
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return undefined;
}

function extractBody(msg: GmailMessage): string {
  // Prefer HTML for AI classification — Claude reads HTML tables well and flight
  // receipts have critical data (dates, times, airports) only in HTML tables
  const htmlPart = findPart(msg.payload.parts, 'text/html');
  if (htmlPart?.body?.data) {
    const rawHtml = base64UrlDecode(htmlPart.body.data);
    // Light cleanup: remove scripts/styles but keep structure for Claude
    return rawHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }

  // Fall back to plain text
  const textPart = findPart(msg.payload.parts, 'text/plain');
  if (textPart?.body?.data) {
    return base64UrlDecode(textPart.body.data);
  }

  // Single-part message
  if (msg.payload.body?.data) {
    const raw = base64UrlDecode(msg.payload.body.data);
    // Check if it's HTML
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    }
    return raw;
  }

  // Last resort: use snippet
  return msg.snippet ?? '';
}

function base64UrlDecode(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64);
  // Handle UTF-8
  return decodeURIComponent(
    Array.from(decoded)
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
