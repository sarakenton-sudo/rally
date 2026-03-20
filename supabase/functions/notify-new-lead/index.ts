import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';

// Sara's phone number for new lead alerts
const ADMIN_PHONE = '+15122975280';

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
    const payload = await req.json();

    // Supabase database webhook sends: { type, table, record, ... }
    const record = payload.record;
    if (!record?.email) {
      return new Response(JSON.stringify({ error: 'No email in record' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const email = record.email;
    const source = record.source || 'unknown';
    const smsBody = `New RALLY lead: ${email} (source: ${source})`;

    console.log('[notify-new-lead] Sending SMS to admin:', smsBody);

    const result = await sendTwilioSMS(ADMIN_PHONE, smsBody);
    if (!result.ok) {
      console.error('[notify-new-lead] Twilio error:', result.error);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('[notify-new-lead] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});

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
