import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are a schedule extraction assistant for a youth select volleyball app called Rally.

Your job is to extract tournament details from unstructured text that a parent might paste — such as a copied GroupMe message, forwarded email, or a schedule list from a coach.

For each tournament you find, extract:
- name: the tournament name (e.g. "Lonestar Classic")
- start_date: YYYY-MM-DD format
- end_date: YYYY-MM-DD format (same as start_date if single day)
- location_city: city and state (e.g. "Dallas, TX")
- venue_name: venue or facility name if mentioned (e.g. "Dallas Convention Center")
- venue_address: full address if available, otherwise empty string
- notes: any extra details like check-in times, format, special instructions

Important rules:
- If you cannot determine the year, assume the current season (2025-2026 school year). Fall dates = 2025, spring dates = 2026.
- If only a month and day are given, infer the year from context.
- If a date range like "March 20-22" is given, start_date is March 20 and end_date is March 22.
- Extract ALL tournaments found in the text.
- If you cannot parse any tournaments, return an empty array.
- Return ONLY valid JSON, no markdown fencing, no explanation.

Respond with a JSON object: { "tournaments": [...] }`;

interface ExtractedTournament {
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venue_name: string;
  venue_address: string;
  notes: string;
}

serve(async (req: Request) => {
  // CORS
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
        model: 'claude-sonnet-4-20250514',
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

    // Parse the JSON from Claude's response
    let extracted: { tournaments: ExtractedTournament[] };
    try {
      extracted = JSON.parse(rawText);
    } catch {
      // Try to extract JSON from potential markdown fencing
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
