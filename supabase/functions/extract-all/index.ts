import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are an intelligent extraction assistant for a youth select volleyball app called Rally.

Parents paste all kinds of text — hotel confirmations, flight bookings, tournament info emails, coach messages, schedule announcements, or a mix of several things. Your job is to figure out what's in the text and extract everything relevant.

Return a JSON object with two optional sections:

{
  "travel": { "bookings": [...] },       // only if travel info found
  "tournament_details": { "details": {...} }  // only if tournament details found
}

If the text contains BOTH travel and tournament info (common with hotel block emails that mention the tournament), extract BOTH.

## Travel Bookings

For each HOTEL booking:
- type: "hotel"
- hotel_name: full hotel name (e.g. "Hilton Minneapolis")
- reservation_number: confirmation/reservation number
- check_in: YYYY-MM-DD
- check_out: YYYY-MM-DD
- platform: "Bonvoy" (Marriott brands), "Direct" (Hilton/Hyatt direct), "Booking.com", "Expedia", "THS" (Team Hotel Store), or "Other"
- booking_name: primary guest name
- booked_by: who made the booking if different, else ""
- cost: nightly rate as number, or null
- cancellation_deadline: cancellation deadline date in YYYY-MM-DD if mentioned, else ""
- notes: IMPORTANT — include ALL of these if found: room type, deposit requirements, cancellation/refund policy, minimum stay, reservation passcode, check-in/check-out times, parking info. This is critical information parents need. Format each on its own line.

For each FLIGHT booking:
- type: "flight"
- airline: airline name
- confirmation_code: record locator / confirmation number
- flight_number: outbound flight number (e.g. "DL4027"), MUST extract — do NOT put in notes
- departure_date: YYYY-MM-DD (outbound)
- return_date: YYYY-MM-DD (return leg)
- departure_time: outbound departure time (e.g. "1:55 PM"), MUST extract — do NOT put in notes
- arrival_time: outbound arrival time (e.g. "5:25 PM"), MUST extract — do NOT put in notes
- departure_airport: 3-letter code or city name (e.g. "AUS"), MUST extract
- arrival_airport: 3-letter code or city name (e.g. "IND"), MUST extract
- seat_number: seat assignment (e.g. "12C"), MUST extract — do NOT put in notes
- ticket_number: if available, else ""
- booked_by: ""
- traveler_names: array of passenger names
- cost: total dollar cost as number, or null. For award tickets, use the cash portion only.
- notes: ONLY for info that doesn't fit above fields (baggage, operated-by, change policy, etc.)

CRITICAL: departure_time, arrival_time, flight_number, seat_number, departure_airport, arrival_airport MUST be in their own fields. Do NOT bury them in notes.

## Tournament Details

- tournament_name: tournament name (strip year prefixes)
- venue_name: facility name
- venue_address: full street address
- location_city: "City, ST"
- ticket_sales_date: YYYY-MM-DD or ""
- ticket_link: URL for tickets
- ticket_system: "Eventbrite", "Showpass", "Electronic", etc.
- schedule_link: URL for schedule (VBSchedule.com, SportWrench, AES, etc.)
- schedule_available_date: YYYY-MM-DD only. Non-date descriptions go in notes.
- division_info: age group / division
- notes: start times, ticket pricing, parking, warm-up balls, bids, etc.

## Rules
- Dates come in MANY formats: "03/19/26", "March 19, 2026", "19MAR", "2026-03-19". Always output YYYY-MM-DD.
- Two-digit years: "26" = 2026.
- "Arrival"/"Departure" = check-in/check-out for hotels.
- Hotel block emails (like THS/Team Hotel Store) often contain BOTH hotel booking details AND tournament name/venue — extract both sections.
- If you see schedule sites mentioned by name (VBSchedule.com, SportWrench.com, AESAthletics.com), include the URL.
- If text has no travel AND no tournament info, return { "travel": null, "tournament_details": null }.
- Return ONLY valid JSON, no markdown fencing.`;

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
            content: `Extract all relevant information from this text:\n\n${text}`,
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

    let extracted;
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
