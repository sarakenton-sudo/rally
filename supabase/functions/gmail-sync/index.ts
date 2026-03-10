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

// Default travel-related sender domains — always included in sync
const TRAVEL_SENDER_DOMAINS = [
  // Hotels
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'wyndham.com',
  'choicehotels.com', 'bestwestern.com', 'radissonhotels.com', 'accor.com',
  'fourseasons.com', 'omnihotels.com', 'druryhotels.com', 'laquinta.com',
  'embassy-suites.hilton.com', 'hamptoninn.hilton.com', 'homewoodsuites.hilton.com',
  // Airlines
  'southwest.com', 'united.com', 'aa.com', 'delta.com', 'jetblue.com',
  'spirit.com', 'frontierairlines.com', 'alaskaair.com', 'allegiantair.com',
  // Booking sites
  'expedia.com', 'hotels.com', 'booking.com', 'priceline.com', 'kayak.com',
  'hotwire.com', 'orbitz.com', 'travelocity.com', 'trivago.com',
  'airbnb.com', 'vrbo.com',
  // Car rental
  'enterprise.com', 'hertz.com', 'avis.com', 'budget.com', 'nationalcar.com',
  // Travel aggregators
  'tripit.com', 'google.com', // Google Travel confirmations
];

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

  try {
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

    return jsonResponse({ synced: results.length, results });
  } catch (err) {
    console.error('Gmail sync error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

async function syncUser(
  supabase: ReturnType<typeof createClient>,
  token: GmailToken,
): Promise<{ user_id: string; emails_processed: number }> {
  // Refresh access token if expired
  let accessToken = token.access_token;
  const expiresAt = new Date(token.token_expires_at);

  if (expiresAt <= new Date()) {
    accessToken = await refreshAccessToken(supabase, token);
  }

  // Fetch team_config for sender filters
  const { data: config } = await supabase
    .from('team_config')
    .select('trusted_sender_emails, travel_sync_emails')
    .eq('user_id', token.user_id)
    .single();

  // Build Gmail search query
  const afterEpoch = token.last_sync_at
    ? Math.floor(new Date(token.last_sync_at).getTime() / 1000)
    : Math.floor(new Date('2025-08-01').getTime() / 1000); // First sync: go back to Aug 2025

  // Build two query strategies:
  // 1. Travel domains — only booking/confirmation emails (not marketing)
  // 2. VIP/trusted senders — all emails from those people (coach, etc.)
  const userVipSenders = config?.trusted_sender_emails ?? [];
  const userTravelSenders = config?.travel_sync_emails ?? [];

  // Travel query: from known domains + must contain booking keywords + exclude marketing
  const bookingKeywords = '"confirmation number" OR "reservation number" OR "booking confirmation" OR itinerary OR "e-ticket" OR "flight details" OR "hotel confirmation" OR "check-in date" OR "check-in time" OR "cancellation policy" OR "cancellation deadline"';
  const excludeMarketing = '-subject:unsubscribe -subject:deals -subject:offer -subject:promotion -subject:"limited time" -subject:sale -subject:reward -subject:points -subject:newsletter -subject:"earn" -subject:"exclusive" -subject:"save" -subject:"% off" -subject:"dream" -subject:"getaway" -subject:"explore"';
  const domainClauses = TRAVEL_SENDER_DOMAINS.map((d) => `from:${d}`);
  const travelFromQuery = domainClauses.join(' OR ');

  let query = `in:inbox after:${afterEpoch} ${excludeMarketing} (`;
  // Travel senders with booking keywords
  query += `({${travelFromQuery}} (${bookingKeywords}))`;

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

  if (messageIds.length === 0) {
    // Update last_sync_at even when no new messages
    await supabase
      .from('gmail_tokens')
      .update({ last_sync_at: new Date().toISOString(), sync_errors: 0 })
      .eq('user_id', token.user_id);
    return { user_id: token.user_id, emails_processed: 0 };
  }

  // Check which messages are already processed
  const { data: existing } = await supabase
    .from('forwarded_emails')
    .select('gmail_message_id')
    .in('gmail_message_id', messageIds);

  const existingIds = new Set((existing ?? []).map((e: { gmail_message_id: string }) => e.gmail_message_id));
  const newMessageIds = messageIds.filter((id) => !existingIds.has(id));

  let processed = 0;

  for (const msgId of newMessageIds) {
    try {
      // Fetch full message
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!msgResponse.ok) continue;

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

      // Skip marketing / irrelevant emails — don't store "other"
      if (classification === 'other') {
        console.log(`Skipping irrelevant email: "${subject}" from ${from}`);
        continue;
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
        console.error(`Failed to store email ${msgId}:`, storeError);
        continue;
      }

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
      console.error(`Failed to process message ${msgId}:`, err);
    }
  }

  // Update sync timestamp and reset errors
  await supabase
    .from('gmail_tokens')
    .update({ last_sync_at: new Date().toISOString(), sync_errors: 0 })
    .eq('user_id', token.user_id);

  return { user_id: token.user_id, emails_processed: processed };
}

async function checkScheduleAndTicketDates(
  supabase: ReturnType<typeof createClient>,
  today: string,
): Promise<void> {
  try {
    // Find tournaments where schedule_available_date or ticket_sales_date is today
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, user_id, name, schedule_available_date, ticket_sales_date')
      .or(`schedule_available_date.eq.${today},ticket_sales_date.eq.${today}`);

    if (!tournaments || tournaments.length === 0) return;

    for (const t of tournaments) {
      if (t.schedule_available_date === today) {
        await supabase.functions.invoke('send-notification', {
          body: {
            user_id: t.user_id,
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
            user_id: t.user_id,
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
  // Recursively search for plain text body
  const textPart = findPart(msg.payload.parts, 'text/plain');
  if (textPart?.body?.data) {
    return base64UrlDecode(textPart.body.data);
  }

  // Fall back to HTML part (also recursive)
  const htmlPart = findPart(msg.payload.parts, 'text/html');
  if (htmlPart?.body?.data) {
    return stripHtml(base64UrlDecode(htmlPart.body.data));
  }

  // Single-part message
  if (msg.payload.body?.data) {
    return base64UrlDecode(msg.payload.body.data);
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
