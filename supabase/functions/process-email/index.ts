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
      .from('admin_config')
      .select('id, user_id, trusted_sender_emails')
      .eq('rally_forward_address', forwardAddress)
      .single();

    if (!config) {
      return jsonResponse({ error: 'No team found for this forward address' }, 404);
    }

    // Classify the email with Claude
    const { classification, action, summary, extractedData } = await classifyEmail(
      CLAUDE_API_KEY,
      email.from,
      email.subject,
      email.text,
    );

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

    // Auto-link ticket URLs to matching tournaments
    if (classification === 'tournament_info' && extractedData.ticket_urls) {
      const ticketUrls = extractedData.ticket_urls as string[];
      if (ticketUrls.length > 0 && extractedData.tournament_name) {
        const tournamentName = (extractedData.tournament_name as string).toLowerCase();
        const { data: matchingTournaments } = await supabase
          .from('tournaments')
          .select('id, name, ticket_link')
          .eq('user_id', config.user_id);

        if (matchingTournaments) {
          const match = matchingTournaments.find((t) =>
            t.name.toLowerCase().includes(tournamentName) ||
            tournamentName.includes(t.name.toLowerCase())
          );
          if (match && !match.ticket_link) {
            await supabase
              .from('tournaments')
              .update({ ticket_link: ticketUrls[0] })
              .eq('id', match.id);
          }
        }
      }
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
