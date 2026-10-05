// send-fan-invite: email a guest their RallyHUB fan invite (00086).
//   POST { guest_id }  (JWT: a parent who manages the guest's athlete)
// Creates the invite code if needed (as the caller, so RLS/ownership applies).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const APP_STORE_URL = 'https://apps.apple.com/app/id6762097230';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: auth } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  const { guest_id } = await req.json().catch(() => ({}));
  if (!guest_id) return json({ error: 'guest_id required' }, 400);

  // As the caller: create_fan_invite checks they manage this guest's athlete.
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
  const { data: code, error: codeErr } = await asCaller.rpc('create_fan_invite', { p_guest_id: guest_id });
  if (codeErr || !code) return json({ error: 'guest not found' }, 404);

  const { data: g } = await admin.from('guests').select('name, email, athletes(first_name)').eq('id', guest_id).single();
  const guest = g as any;
  if (!guest?.email) return json({ code, emailed: false, email_status: 'no email on file' });

  const { data: prof } = await admin.from('user_profiles').select('display_name').eq('id', auth.user.id).maybeSingle();
  const from = (prof?.display_name ?? '').trim().split(' ')[0] || 'A RallyHUB family';
  const athlete = guest.athletes?.first_name ?? 'our athlete';
  const first = String(guest.name ?? '').trim().split(' ')[0];
  const link = `https://rally-hub.com/fan/${code}`;
  const subject = `Follow ${athlete}'s volleyball season on RallyHUB`;
  const html = `
    <p>${first ? `Hi ${esc(first)},` : 'Hi,'}</p>
    <p>${esc(from)} invited you to follow ${esc(athlete)}'s season on RallyHUB: every tournament's dates and location, live stream and ticket links, and a heads-up on game day.</p>
    <p><a href="${link}" style="display:inline-block;background:#3B82B0;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Follow ${esc(athlete)}</a></p>
    <p>On iPhone, <a href="${APP_STORE_URL}">get the free RallyHUB app</a> and enter fan code <b>${code}</b> when you sign up.</p>
    <p style="color:#6B8BA8;font-size:13px">You're getting this because ${esc(from)} added you as a guest in RallyHUB.</p>`;

  let emailStatus: number | string = 'no key';
  if (SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SENDGRID_API_KEY}` },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: guest.email }] }],
        from: { email: 'hello@rally-hub.com', name: 'RallyHUB' },
        subject, content: [{ type: 'text/html', value: html }],
      }),
    });
    emailStatus = r.status;
    if (!r.ok) {
      const detail = await r.text();
      console.error('[send-fan-invite] sendgrid', r.status, detail);
      try { emailStatus = `${r.status}: ${JSON.parse(detail).errors?.[0]?.message ?? ''}`; } catch { /* keep */ }
    }
  }
  return json({ code, emailed: emailStatus === 202, email_status: emailStatus });
});
