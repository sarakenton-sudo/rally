// places-search: venue suggestions for "Venue name" fields (Google Places API,
// Text Search). The API key stays on the server (GOOGLE_PLACES_API_KEY).
//   POST { q: "Austin Sports Center" }  →  { results: [{ name, address }] }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Signed-in RallyHUB users only (keeps the key from being used by anyone else).
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'auth required' }, 401);
  if (!KEY) return json({ results: [], error: 'not_configured' });

  const { q } = await req.json().catch(() => ({ q: '' }));
  const query = String(q ?? '').trim().slice(0, 120);
  if (query.length < 3) return json({ results: [] });

  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5, languageCode: 'en', regionCode: 'US' }),
  }).catch(() => null);
  if (!r || !r.ok) {
    const detail = r ? (await r.json().catch(() => ({})))?.error?.message ?? '' : '';
    console.error('[places-search]', r?.status, detail);
    return json({ results: [], error: r ? `places_${r.status}` : 'network', detail });
  }
  const data = await r.json();
  const results = (data.places ?? []).map((p: any) => ({ name: p.displayName?.text ?? '', address: p.formattedAddress ?? '' }))
    .filter((p: any) => p.name);
  return json({ results });
});
