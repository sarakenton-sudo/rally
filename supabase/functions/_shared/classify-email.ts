const CLASSIFICATION_PROMPT = `You are an email classifier for a youth volleyball team management app called Rally.
This app helps families manage travel for youth volleyball tournaments.

Classify the email into exactly ONE category:
- "stay_and_play": Hotel booking confirmation, reservation details, stay-and-play hotel block info, hotel check-in details. Must reference a specific hotel + dates or confirmation.
- "travel_confirmation": Flight confirmation, receipt, itinerary, boarding pass, car rental confirmation. Must reference specific flight/booking details.
- "coach_announcement": Messages from a coach about practice, team updates, lineups, team logistics
- "schedule_change": Tournament schedule updates, pool reassignments, venue changes, bracket postings
- "tournament_info": ANY email about a specific volleyball tournament — logistics, check-in info, parking, venue details, ticket info, schedules, hotel blocks, event rules, team registration, spectator info. Emails from volleyball organizations (AJV, USAV, JVA, LeagueApps, AES, AAU, etc.) about specific events are ALWAYS tournament_info.
- "other": ONLY for emails completely unrelated to travel or volleyball:
  * Airline/hotel MARKETING with no specific booking (loyalty points, credit cards, "explore destinations", mileage statements, sales)
  * Retail/shopping, social media, app notifications, security alerts
  * News digests unrelated to volleyball

KEY RULES:
1. If the email mentions a SPECIFIC tournament name, volleyball event, or tournament dates → it is NOT "other". Classify as tournament_info, schedule_change, or stay_and_play.
2. Emails from volleyball organizations (LeagueApps, AJV, USAV, JVA, AES, AAU, SportsEngine) are almost ALWAYS tournament_info — even if they have unsubscribe links.
3. For airlines/hotels: only classify as "other" if there's NO specific booking, confirmation, or trip referenced. A flight receipt is travel_confirmation even if it has an unsubscribe footer.
4. When in doubt, KEEP the email (classify as tournament_info or unclassified). We'd rather have a few extras than miss important tournament communications.

Extract ALL pertinent structured data from the email. Be thorough:
- For stay_and_play: hotel_name, check_in_date (YYYY-MM-DD), check_out_date (YYYY-MM-DD), confirmation_number, nightly_rate, total_cost, cancellation_deadline (YYYY-MM-DD), address, phone, booking_url, number_of_nights
- For travel_confirmation (flights): airline, flight_number, departure_date (YYYY-MM-DD), departure_time (HH:MM), arrival_time (HH:MM), departure_airport (3-letter code), arrival_airport (3-letter code), departure_city, arrival_city, confirmation_number, passenger_name, booking_url. For round trips, extract BOTH legs as "outbound" and "return" objects with the same fields. Parse dates from ANY format (e.g., "19MAR26" = 2026-03-19, "Mar 19, 2026" = 2026-03-19).
- For schedule_change/tournament_info: tournament_name, start_date, end_date, location_city, venue_name, venue_address, pool_info, check_in_time, schedule_url
- For tournament_info: also extract ticket_code, ticket_url (URLs containing "ticket", "aes", "gofan", "aesathletics", or similar), registration_deadline, entry_fee
- For coach_announcement: key message summary, any dates/times mentioned, action_items

IMPORTANT — Schedule and ticket timing:
- If the email mentions WHEN schedules will be posted (e.g., "Schedule will be posted Wednesday prior to the event", "Pools released the Monday before"), extract as "schedule_available_description" (the raw text) AND compute "schedule_available_date" as an ISO date (YYYY-MM-DD) by calculating from the tournament start_date. For example, if start_date is 2026-03-14 (Saturday) and schedule posts "Wednesday prior", that's 2026-03-11.
- If the email mentions WHEN ticket sales start (e.g., "Tickets on sale March 1", "Spectator tickets available two weeks before"), extract as "ticket_sales_description" (raw text) AND compute "ticket_sales_date" as ISO date (YYYY-MM-DD).

IMPORTANT — Extract ALL URLs/links from the email HTML:
- The email body is often HTML. Look for <a href="..."> tags and extract the FULL href URLs.
- For tournament_info: extract schedule_url (links to schedules, brackets, pool sheets), ticket_url (links to buy tickets — gofan, aesathletics, eventbrite, etc.), registration links
- For stay_and_play: extract booking_url (link to manage/view reservation)
- For travel_confirmation: extract booking_url (link to manage trip/check in)
- Extract ANY URL that looks like it could be useful for tournament management (schedule links, venue maps, parking info, etc.) as "additional_urls" array

The email body may be HTML — parse data from HTML tables, spans, and divs. Flight receipts often have dates, times, and airports in HTML table cells. Extract href URLs from anchor tags.
Include only fields that are actually present in the email. Use ISO date format (YYYY-MM-DD) for dates when possible. Use HH:MM (24-hour) for times.

Respond with JSON only:
{
  "classification": "one_of_the_categories",
  "action": "booking_alert_sent" | "travel_import_queued" | "notification_sent" | "none",
  "summary": "Brief 1-sentence summary of the email",
  "extracted_data": { ... all structured data extracted ... }
}`;

export interface ClassificationResult {
  classification: string;
  action: string;
  summary: string;
  extractedData: Record<string, unknown>;
}

export async function classifyEmail(
  claudeApiKey: string,
  from: string,
  subject: string,
  body: string,
): Promise<ClassificationResult> {
  const result: ClassificationResult = {
    classification: 'other',
    action: 'none',
    summary: '',
    extractedData: {},
  };

  if (!claudeApiKey) {
    console.error('[classify-email] CLAUDE_API_KEY is not set! All emails will be classified as "other"');
    result.classification = 'unclassified';
    result.summary = 'Classification unavailable — CLAUDE_API_KEY not configured';
    return result;
  }

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: CLASSIFICATION_PROMPT,
      messages: [{
        role: 'user',
        content: `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 8000)}`,
      }],
    }),
  });

  if (claudeResponse.ok) {
    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text ?? '';
    try {
      const parsed = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      result.classification = parsed.classification ?? 'other';
      result.action = parsed.action ?? 'none';
      result.extractedData = parsed.extracted_data ?? {};
      result.summary = parsed.summary ?? '';
    } catch {
      console.error('Failed to parse Claude classification response, raw:', rawText.slice(0, 200));
      // Don't default to "other" on parse failure — mark as unclassified so it still gets stored
      result.classification = 'unclassified';
      result.summary = 'AI classification failed — needs manual review';
    }
  } else {
    const errorText = await claudeResponse.text();
    console.error(`[classify-email] Claude API failed (${claudeResponse.status}): ${errorText.slice(0, 500)}`);
    // Don't default to "other" — mark as unclassified so it still gets stored
    result.classification = 'unclassified';
    const isBilling = errorText.includes('credit balance') || errorText.includes('billing');
    result.summary = isBilling
      ? 'AI classification unavailable — Anthropic API credits exhausted. Add credits at console.anthropic.com'
      : `AI classification failed (${claudeResponse.status}) — needs manual review`;
  }

  return result;
}
