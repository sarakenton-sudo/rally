import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are a travel extraction assistant for a youth select volleyball app called Rally.

Your job is to extract hotel bookings and flight bookings from unstructured text that a parent might paste — such as a forwarded confirmation email, a booking receipt, a hotel block reservation, or a travel coordinator message.

For each HOTEL booking you find, extract:
- type: "hotel"
- hotel_name: the hotel name (e.g. "Hilton Minneapolis", "Courtyard by Marriott Dallas")
- reservation_number: confirmation or reservation number
- check_in: YYYY-MM-DD format
- check_out: YYYY-MM-DD format
- platform: booking platform — "Bonvoy" for Marriott brands, "Direct" for Hilton/Hyatt direct, "Booking.com", "Expedia", "Hotels.com", "THS" for Team Hotel Store, or "Other"
- booking_name: primary guest name
- booked_by: who made the booking if different from guest, otherwise empty string
- cost: nightly rate as a number (no $ sign), or null if not found
- cancellation_deadline: cancellation deadline date in YYYY-MM-DD if mentioned, else ""
- notes: IMPORTANT — include ALL of these if found: room type, deposit requirements, cancellation/refund policy, minimum stay, reservation passcode, check-in/check-out times, parking info. This is critical information parents need. Format each on its own line.

For each FLIGHT booking you find, extract:
- type: "flight"
- airline: airline name (e.g. "Southwest", "Delta", "United", "American")
- confirmation_code: the confirmation/record locator code
- departure_date: YYYY-MM-DD format
- return_date: YYYY-MM-DD format (same as departure if one-way)
- ticket_number: ticket number if available, otherwise empty string
- booked_by: who booked if mentioned, otherwise empty string
- traveler_names: array of passenger names
- cost: total cost as a number, or null if not found
- notes: seat assignments, baggage info, etc.

Important rules:
- Dates come in MANY formats: "03/19/26", "March 19, 2026", "2026-03-19", "19MAR", "Thu, 19MAR", "3/19/2026". ALWAYS convert to YYYY-MM-DD.
- Two-digit years: "26" = 2026, "25" = 2025.
- "Arrival" / "Departure" for hotels = check_in / check_out.
- Hotel block reservations (like THS, Team Hotel Store, etc.) are hotel bookings.
- If you see both a hotel and flight in the same text, extract BOTH as separate bookings.
- Extract ALL bookings found in the text.
- If you cannot parse any bookings, return an empty array.
- Return ONLY valid JSON, no markdown fencing, no explanation.

Respond with a JSON object: { "bookings": [...] }`;

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
            content: `Extract travel booking details from this text:\n\n${text}`,
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

    let extracted: { bookings: any[] };
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
