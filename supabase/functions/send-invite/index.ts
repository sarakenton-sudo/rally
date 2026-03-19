import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface SendInvitePayload {
  lead_id?: string;
  lead_ids?: string[];
}

interface Lead {
  id: string;
  email: string;
  phone: string | null;
  status: string;
}

interface LeadResult {
  lead_id: string;
  email: string;
  channels: { channel: string; status: string; error?: string }[];
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
    const payload: SendInvitePayload = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize to array of IDs
    const leadIds: string[] = payload.lead_ids ?? (payload.lead_id ? [payload.lead_id] : []);

    if (leadIds.length === 0) {
      return jsonResponse({ error: 'Missing lead_id or lead_ids' }, 400);
    }

    // Fetch leads from DB
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, email, phone, status')
      .in('id', leadIds);

    if (fetchError) {
      console.error('Error fetching leads:', fetchError);
      return jsonResponse({ error: 'Failed to fetch leads' }, 500);
    }

    if (!leads || leads.length === 0) {
      return jsonResponse({ error: 'No leads found for provided IDs' }, 404);
    }

    // Try to load email template from DB
    const { data: tpl } = await supabase
      .from('email_templates')
      .select('subject, html_body')
      .eq('slug', 'early_access_invite')
      .single();

    const results: LeadResult[] = [];

    for (const lead of leads as Lead[]) {
      const channels: { channel: string; status: string; error?: string }[] = [];

      // Send email via SendGrid
      if (lead.email && SENDGRID_API_KEY) {
        let subject: string;
        let html: string;

        if (tpl) {
          subject = tpl.subject;
          html = tpl.html_body;
        } else {
          // Hardcoded fallback
          subject = "You're invited to RALLY!";
          html = buildInviteEmailHtml();
        }

        const emailResult = await sendSendGridEmail(lead.email, subject, html);
        channels.push({
          channel: 'email',
          status: emailResult.ok ? 'sent' : 'failed',
          error: emailResult.error,
        });
      }

      // Send SMS via Twilio
      if (lead.phone && TWILIO_ACCOUNT_SID) {
        const smsBody =
          "You've been invited to RALLY! Create your account: rally-hub.com/auth?signup=true";
        const smsResult = await sendTwilioSMS(lead.phone, smsBody);
        channels.push({
          channel: 'sms',
          status: smsResult.ok ? 'sent' : 'failed',
          error: smsResult.error,
        });
      }

      // Update lead status to 'invited' if any channel succeeded
      const hasSent = channels.some((c) => c.status === 'sent');
      if (hasSent) {
        await supabase
          .from('leads')
          .update({ status: 'invited', invited_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

      results.push({ lead_id: lead.id, email: lead.email, channels });
    }

    return jsonResponse({ success: true, results });
  } catch (err) {
    console.error('send-invite edge function error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// ── SendGrid Email ────────────────────────────────────────

async function sendSendGridEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'hello@rally-hub.com', name: 'RALLY' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Twilio SMS ─────────────────────────────────────────────

async function sendTwilioSMS(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: body,
      }).toString(),
    });

    if (!res.ok) {
      const errData = await res.json();
      return { ok: false, error: errData.message ?? 'Twilio error' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Email Template ────────────────────────────────────────

function buildInviteEmailHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to RALLY!</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1E3A5F;padding:28px 32px;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;"><img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:100px;width:auto;" /></a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You're In!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Great news — you've been invited to join <strong>RALLY</strong>, the volleyball family hub that keeps your tournament travel organized.
              </p>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Track tournaments, manage travel bookings, coordinate with family — all in one place. No more digging through emails and group chats.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com/auth?signup=true" target="_blank" style="display:inline-block;background-color:#1E3A5F;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
              <p style="margin:0 0 4px;color:#8FA8BF;font-size:12px;">
                Questions? Reach out at hello@rally-hub.com
              </p>
              <p style="margin:0;color:#8FA8BF;font-size:12px;">
                RALLY by Quiet Standard LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
