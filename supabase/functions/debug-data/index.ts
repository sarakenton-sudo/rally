import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Use service role to bypass RLS
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  const [athletes, seasons, tournaments, hotels, flights, adminAthletes, adminConfig] = await Promise.all([
    supabase.from('athletes').select('id, first_name, user_id'),
    supabase.from('seasons').select('id, team_name, season_year, athlete_id'),
    supabase.from('tournaments').select('id, name, start_date, season_id'),
    supabase.from('hotel_bookings').select('id, hotel_name, tournament_id'),
    supabase.from('flight_bookings').select('id, airline, tournament_id'),
    supabase.from('admin_athletes').select('*'),
    supabase.from('admin_config').select('id, user_id, active_season_id'),
  ]);

  return new Response(JSON.stringify({
    athletes: { count: athletes.data?.length, data: athletes.data, error: athletes.error?.message },
    seasons: { count: seasons.data?.length, data: seasons.data, error: seasons.error?.message },
    tournaments: { count: tournaments.data?.length, data: tournaments.data, error: tournaments.error?.message },
    hotels: { count: hotels.data?.length, data: hotels.data, error: hotels.error?.message },
    flights: { count: flights.data?.length, data: flights.data, error: flights.error?.message },
    adminAthletes: { count: adminAthletes.data?.length, data: adminAthletes.data, error: adminAthletes.error?.message },
    adminConfig: { count: adminConfig.data?.length, data: adminConfig.data, error: adminConfig.error?.message },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
