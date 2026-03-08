import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CLASSIFICATION_PROMPT = `You are an email classifier for a youth volleyball team management app called Rally.

Classify the email into exactly ONE category:
- "stay_and_play": Hotel booking confirmation, stay-and-play deals, hotel block info
- "travel_confirmation": Flight confirmation, car rental, travel itinerary
- "coach_announcement": Messages from the coach about practice, team updates, lineups
- "schedule_change": Tournament schedule updates, pool reassignments, venue changes
- "tournament_info": Tournament registration, bracket info, AES updates, check-in details
- "other": Anything that doesn't fit the above

Also extract any actionable data:
- For stay_and_play/travel_confirmation: hotel name, dates, confirmation number, cost
- For schedule_change/tournament_info: tournament name, dates, location, venue changes
- For coach_announcement: key message summary

Respond with JSON only:
{
  "classification": "one_of_the_categories",
  "action": "booking_alert_sent" | "travel_import_queued" | "notification_sent" | "none",
  "summary": "Brief 1-sentence summary of the email",
  "extracted_data": { ... any structured data extracted ... }
}`;

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

    // Parse inbound email (supports SendGrid/Mailgun webhook format)
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
      // JSON format (direct API call or Mailgun)
      email = await req.json();
    }

    if (!email.to || !email.text) {
      return jsonResponse({ error: 'Missing required email fields' }, 400);
    }

    // Look up the team by Rally forward address
    const forwardAddress = extractAddress(email.to);
    const { data: config } = await supabase
      .from('team_config')
      .select('id, user_id, trusted_sender_emails')
      .eq('rally_forward_address', forwardAddress)
      .single();

    if (!config) {
      return jsonResponse({ error: 'No team found for this forward address' }, 404);
    }

    // Classify the email with Claude
    let classification = 'other';
    let action = 'none';
    let extractedData: Record<string, unknown> = {};
    let summary = '';

    if (CLAUDE_API_KEY) {
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: CLASSIFICATION_PROMPT,
          messages: [{
            role: 'user',
            content: `From: ${email.from}\nSubject: ${email.subject}\n\n${email.text.slice(0, 4000)}`,
          }],
        }),
      });

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        const rawText = claudeData.content?.[0]?.text ?? '';
        try {
          const parsed = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
          classification = parsed.classification ?? 'other';
          action = parsed.action ?? 'none';
          extractedData = parsed.extracted_data ?? {};
          summary = parsed.summary ?? '';
        } catch {
          console.error('Failed to parse Claude classification response');
        }
      }
    }

    // Store the email
    const { data: stored, error: storeError } = await supabase
      .from('forwarded_emails')
      .insert({
        user_id: config.user_id,
        from_address: email.from,
        subject: email.subject,
        body_text: email.text,
        received_at: new Date().toISOString(),
        classification,
        action_taken: action,
        raw_storage_url: null,
      })
      .select()
      .single();

    if (storeError) {
      console.error('Failed to store email:', storeError);
      return jsonResponse({ error: 'Failed to store email' }, 500);
    }

    // Take action based on classification
    if (classification === 'stay_and_play' || classification === 'travel_confirmation') {
      // Trigger a notification to the parent about the detected booking
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
  } catch (err) {
    console.error('Process email error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function extractAddress(to: string): string {
  // Handle "Name <email@example.com>" format
  const match = to.match(/<([^>]+)>/);
  return match ? match[1] : to.trim();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
