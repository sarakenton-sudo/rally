import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface NotificationPayload {
  user_id: string;
  type: 'tournament_reminder' | 'rsvp_request' | 'cancellation_deadline' | 'schedule_change' | 'custom';
  tournament_id?: string;
  guest_ids?: string[];      // Send to specific guests
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
    const payload: NotificationPayload = await req.json();
    const { user_id, type, tournament_id, guest_ids, title, body, data } = payload;

    if (!user_id || !title || !body) {
      return jsonResponse({ error: 'Missing required fields: user_id, title, body' }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results: { channel: string; guest_id: string | null; status: string; error?: string }[] = [];

    // 1. Send push notification to the parent (app user)
    const { data: sessions } = await supabase
      .from('app_sessions')
      .select('push_token')
      .eq('user_id', user_id)
      .not('push_token', 'is', null);

    if (sessions && sessions.length > 0) {
      for (const session of sessions) {
        const pushResult = await sendExpoPush(session.push_token, title, body, data);
        results.push({ channel: 'push', guest_id: null, status: pushResult.ok ? 'sent' : 'failed', error: pushResult.error });

        // Log to notification_log
        await supabase.from('notification_log').insert({
          user_id,
          tournament_id: tournament_id ?? null,
          notification_type: type,
          channel: 'push',
          message: body,
          status: pushResult.ok ? 'sent' : 'failed',
        });
      }
    }

    // 2. Send SMS to invited guests
    if (guest_ids && guest_ids.length > 0) {
      const { data: guests } = await supabase
        .from('guests')
        .select('id, name, phone')
        .in('id', guest_ids);

      if (guests) {
        for (const guest of guests) {
          if (guest.phone && TWILIO_ACCOUNT_SID) {
            const smsResult = await sendTwilioSMS(guest.phone, `${title}\n${body}`);
            results.push({ channel: 'sms', guest_id: guest.id, status: smsResult.ok ? 'sent' : 'failed', error: smsResult.error });

            await supabase.from('notification_log').insert({
              user_id,
              guest_id: guest.id,
              tournament_id: tournament_id ?? null,
              notification_type: type,
              channel: 'sms',
              message: body,
              status: smsResult.ok ? 'sent' : 'failed',
            });
          }
        }
      }
    }

    return jsonResponse({ success: true, results });
  } catch (err) {
    console.error('Notification edge function error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// ── Expo Push ──────────────────────────────────────────────

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
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

// ── Helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
