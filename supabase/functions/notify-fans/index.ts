// notify-fans: push a parent's tournament update to every guest who follows
// that athlete in the RallyHUB app (fans). Free, unlike SMS.
//   POST { update_id }  (JWT: the parent who posted it via post_tournament_update)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  const { update_id } = await req.json().catch(() => ({}));

  const { data: u } = await admin.from('tournament_updates')
    .select('id, message, created_by, tournament_id, tournaments(name, seasons(athletes(first_name)))')
    .eq('id', update_id).maybeSingle();
  const up = u as any;
  if (!up || up.created_by !== auth.user.id) return json({ error: 'not found' }, 404);

  const { data: fans } = await admin.rpc('tournament_fan_user_ids', { p_tournament_id: up.tournament_id });
  const fanIds = ((fans as string[] | null) ?? []).filter(Boolean);
  if (!fanIds.length) return json({ fans: 0, pushed: 0 });

  const athlete = up.tournaments?.seasons?.athletes?.first_name;
  const title = `${athlete ? `${athlete} · ` : ''}${up.tournaments?.name ?? 'Tournament update'}`;
  const { data: tokens } = await admin.from('push_tokens').select('token, user_id').in('user_id', fanIds);
  const msgs = (tokens ?? []).map((t: any) => ({ to: t.token, title, body: up.message, sound: 'default', data: { type: 'fan_update', tournamentId: up.tournament_id } }));
  for (let i = 0; i < msgs.length; i += 100) {
    await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msgs.slice(i, i + 100)) })
      .catch((e) => console.error('[notify-fans] push', e));
  }
  // Fans with the app but notifications off still see it on the tournament (my_fan_family).
  return json({ fans: fanIds.length, pushed: msgs.length, on_app_without_push: fanIds.length - new Set((tokens ?? []).map((t: any) => t.user_id)).size });
});
