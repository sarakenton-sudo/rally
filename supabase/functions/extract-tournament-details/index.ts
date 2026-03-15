import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are a tournament detail extraction assistant for a youth select volleyball app called Rally.

Your job is to extract detailed tournament information from unstructured text that a parent might paste — such as a tournament info email, a coach's message, a tournament director announcement, or an info packet.

Extract these fields:
- tournament_name: the tournament name (e.g. "Mizuno Northern Lights Qualifier", "Lonestar Classic"). Remove year prefixes like "2026" from the name.
- venue_name: the venue or facility name (e.g. "Minneapolis Convention Center", "Kay Bailey Hutchison Convention Center")
- venue_address: full street address if available (e.g. "1301 2nd Ave South, Minneapolis, MN 55403")
- location_city: city and state (e.g. "Minneapolis, MN", "Dallas, TX")
- ticket_sales_date: when tickets go on sale, in YYYY-MM-DD format. If not a specific date, leave empty.
- ticket_link: URL for purchasing tickets
- ticket_system: the ticketing platform (e.g. "Eventbrite", "Showpass", "Electronic", "Electronic (QR)")
- schedule_link: URL where the tournament schedule is posted (e.g. VBSchedule.com link, SportWrench link, AES link)
- schedule_available_date: when the schedule will be posted, in YYYY-MM-DD format. If it's a description like "Wednesday night prior to the event", leave this empty and put the description in notes instead.
- division_info: division or age group information
- notes: any other useful details — start times, warm-up ball info, ticket pricing, parking info, credential requirements, bids available, minimum stay requirements, etc. Format as short lines separated by newlines.

Important rules:
- Dates come in MANY formats: "March 16, 2026", "3/16/26", "2026-03-16", "Mar 16". ALWAYS convert to YYYY-MM-DD when it's a specific date.
- Two-digit years: "26" = 2026, "25" = 2025.
- For schedule_available_date, ONLY use YYYY-MM-DD format. If the text says something like "Wednesday night prior" or "the week before", put that in notes instead.
- Look for schedule sites mentioned by name: VBSchedule.com, SportWrench.com, AESAthletics.com — construct the base URL if a full link isn't provided.
- Look for ticket pricing info (adult pass, single day, children free) and include in notes.
- "Subject:" lines often contain the tournament name.
- If you cannot determine a field, return an empty string for it.
- Return ONLY valid JSON, no markdown fencing, no explanation.

Respond with a JSON object: { "details": { tournament_name, venue_name, venue_address, location_city, ticket_sales_date, ticket_link, ticket_system, schedule_link, schedule_available_date, division_info, notes } }`;

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
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'No text provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!CLAUDE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract tournament details from this text:\n\n${text}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errBody);
      return new Response(JSON.stringify({ error: 'Claude API request failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    let extracted: { details: any };
    try {
      extracted = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(JSON.stringify({ error: 'Failed to parse extraction result', raw: rawText }), {
          status: 422,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response(JSON.stringify(extracted), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
