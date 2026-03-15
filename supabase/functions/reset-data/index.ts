import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  const results: Record<string, any> = {};

  // 1. Delete admin_config (references seasons via active_season_id)
  const r1 = await supabase.from('admin_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.admin_config = { error: r1.error?.message ?? null };

  // 2. Delete admin_athletes
  const r2 = await supabase.from('admin_athletes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.admin_athletes = { error: r2.error?.message ?? null };

  // 3. Delete athlete_invites
  const r3 = await supabase.from('athlete_invites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.athlete_invites = { error: r3.error?.message ?? null };

  // 4. Delete forwarded_emails
  const r4 = await supabase.from('forwarded_emails').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.forwarded_emails = { error: r4.error?.message ?? null };

  // 5. Delete hotel_bookings (before tournaments)
  const r5 = await supabase.from('hotel_bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.hotel_bookings = { error: r5.error?.message ?? null };

  // 6. Delete flight_bookings (before tournaments)
  const r6 = await supabase.from('flight_bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.flight_bookings = { error: r6.error?.message ?? null };

  // 7. Delete tournament_guests (before tournaments)
  const r7 = await supabase.from('tournament_guests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.tournament_guests = { error: r7.error?.message ?? null };

  // 8. Delete tournaments (before seasons)
  const r8 = await supabase.from('tournaments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.tournaments = { error: r8.error?.message ?? null };

  // 9. Delete team_events (before seasons)
  const r9 = await supabase.from('team_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.team_events = { error: r9.error?.message ?? null };

  // 10. Delete guests (before athletes)
  const r10 = await supabase.from('guests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.guests = { error: r10.error?.message ?? null };

  // 11. Delete seasons (before athletes)
  const r11 = await supabase.from('seasons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.seasons = { error: r11.error?.message ?? null };

  // 12. Delete athletes
  const r12 = await supabase.from('athletes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  results.athletes = { error: r12.error?.message ?? null };

  // Verify everything is empty
  const [a, s, t, h, f] = await Promise.all([
    supabase.from('athletes').select('id', { count: 'exact', head: true }),
    supabase.from('seasons').select('id', { count: 'exact', head: true }),
    supabase.from('tournaments').select('id', { count: 'exact', head: true }),
    supabase.from('hotel_bookings').select('id', { count: 'exact', head: true }),
    supabase.from('flight_bookings').select('id', { count: 'exact', head: true }),
  ]);

  return new Response(JSON.stringify({
    results,
    verification: {
      athletes: a.count,
      seasons: s.count,
      tournaments: t.count,
      hotel_bookings: h.count,
      flight_bookings: f.count,
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
