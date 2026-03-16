import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface SendReferralPayload {
  // Option A: pass a referral_id to look up
  referral_id?: string;
  // Option B: pass inline (consumer app creates referral first, then calls with these)
  referrer_user_id?: string;
  referred_email?: string | null;
  referred_phone?: string | null;
  // Optional: for co-parent invite emails
  invite_code?: string;
  invite_type?: 'referral' | 'coparent' | 'athlete';
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
    const payload: SendReferralPayload = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let referrerUserId = payload.referrer_user_id;
    let referredEmail = payload.referred_email;
    let referredPhone = payload.referred_phone;
    let referralId = payload.referral_id;
    const inviteCode = payload.invite_code ?? null;
    const inviteType = payload.invite_type ?? 'referral';

    // If referral_id provided, look up the record
    if (referralId && !referrerUserId) {
      const { data: referral, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('id', referralId)
        .single();

      if (error || !referral) {
        return jsonResponse({ error: 'Referral not found' }, 404);
      }

      referrerUserId = referral.referrer_user_id;
      referredEmail = referral.referred_email;
      referredPhone = referral.referred_phone;
    }

    if (!referrerUserId) {
      return jsonResponse({ error: 'Missing referrer_user_id or referral_id' }, 400);
    }
    if (!referredEmail && !referredPhone) {
      return jsonResponse({ error: 'No referred_email or referred_phone provided' }, 400);
    }

    // Look up referrer name
    const { data: userData } = await supabase.auth.admin.getUserById(referrerUserId);
    const referrerName =
      userData?.user?.user_metadata?.full_name ||
      userData?.user?.email?.split('@')[0] ||
      'A friend';

    const results: { channel: string; status: string; error?: string }[] = [];

    // Send email via SendGrid
    if (referredEmail && SENDGRID_API_KEY) {
      const slugMap: Record<string, string> = {
        referral: 'referral_invite',
        coparent: 'coparent_invite',
        athlete: 'athlete_invite',
      };
      const templateSlug = slugMap[inviteType] ?? 'referral_invite';

      // Try to load template from DB (editable via admin panel)
      const { data: tpl } = await supabase
        .from('email_templates')
        .select('subject, html_body')
        .eq('slug', templateSlug)
        .single();

      let subject: string;
      let html: string;
      if (tpl) {
        subject = tpl.subject;
        // Replace template variables
        const vars: Record<string, string> = {
          referrer_name: escapeHtml(referrerName),
          invite_code: inviteCode ? escapeHtml(inviteCode) : '',
        };
        html = tpl.html_body;
        for (const [key, val] of Object.entries(vars)) {
          html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
        }
      } else {
        // Fallback to hardcoded templates if DB lookup fails
        if (inviteType === 'athlete') {
          html = buildAthleteEmailHtml(referrerName, inviteCode!);
          subject = "You've been added to RALLY!";
        } else if (inviteType === 'coparent') {
          html = buildCoParentEmailHtml(referrerName, inviteCode!);
          subject = "You've been invited to join RALLY!";
        } else {
          html = buildReferralEmailHtml(referrerName);
          subject = "You've been invited to RALLY!";
        }
      }

      const emailResult = await sendSendGridEmail(referredEmail, subject, html);
      results.push({ channel: 'email', status: emailResult.ok ? 'sent' : 'failed', error: emailResult.error });
    }

    // Send SMS via Twilio
    if (referredPhone && TWILIO_ACCOUNT_SID) {
      let smsBody: string;
      if (inviteType === 'athlete' && inviteCode) {
        smsBody = `${referrerName} added you to RALLY! Use code ${inviteCode} to see your schedule and team info. Sign up at rally-hub.com`;
      } else if (inviteType === 'coparent' && inviteCode) {
        smsBody = `${referrerName} invited you to RALLY — the volleyball family hub. Your invite code: ${inviteCode}. Sign up at rally-hub.com`;
      } else {
        smsBody = `${referrerName} invited you to RALLY — the volleyball family hub. Download at rally-hub.com`;
      }

      const smsResult = await sendTwilioSMS(referredPhone, smsBody);
      results.push({ channel: 'sms', status: smsResult.ok ? 'sent' : 'failed', error: smsResult.error });
    }

    // Update referral status if we have a referral_id
    if (referralId) {
      const hasSent = results.some((r) => r.status === 'sent');
      if (hasSent) {
        await supabase
          .from('referrals')
          .update({ status: 'sent' })
          .eq('id', referralId);
      }
    }

    return jsonResponse({ success: true, results });
  } catch (err) {
    console.error('send-referral edge function error:', err);
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

// ── Email Templates ───────────────────────────────────────

function buildReferralEmailHtml(referrerName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to RALLY!</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You've been invited to RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(referrerName)}</strong> thinks you'd love RALLY — the volleyball family hub that keeps your tournament season organized.
              </p>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Track tournaments, manage travel bookings, coordinate with family — all in one place. No more digging through emails and group chats.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Get Started with RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
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

function buildAthleteEmailHtml(referrerName: string, inviteCode: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been added to RALLY!</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You've been added to RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(referrerName)}</strong> added you to RALLY so you can see your tournament schedule, team info, and travel details all in one place.
              </p>
              <p style="margin:0 0 8px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Your invite code:
              </p>
              <!-- Invite Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #3B82B0;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#3B82B0;letter-spacing:4px;font-family:'Courier New',monospace;">
                        ${escapeHtml(inviteCode)}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:14px;line-height:1.6;">
                Sign up at rally-hub.com and enter the code above to get started.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
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

function buildCoParentEmailHtml(referrerName: string, inviteCode: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to join RALLY!</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You've been invited to join RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(referrerName)}</strong> has invited you to share access on RALLY — the volleyball family hub that keeps your tournament season organized.
              </p>
              <p style="margin:0 0 8px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Your invite code:
              </p>
              <!-- Invite Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #3B82B0;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#3B82B0;letter-spacing:4px;font-family:'Courier New',monospace;">
                        ${escapeHtml(inviteCode)}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:14px;line-height:1.6;">
                Sign up at rally-hub.com, then enter the code above to link your account.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
