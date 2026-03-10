const CLASSIFICATION_PROMPT = `You are an email classifier for a youth volleyball team management app called Rally.
This app helps families manage travel for youth volleyball tournaments. Err on the side of KEEPING emails — only classify as "other" if it's clearly irrelevant marketing.

Classify the email into exactly ONE category:
- "stay_and_play": Hotel booking confirmation, hotel reservation, stay-and-play deals, hotel block info, hotel check-in info, ANY email from a hotel chain about an actual stay/reservation
- "travel_confirmation": Flight confirmation, flight receipt, flight itinerary, boarding pass, trip summary, car rental confirmation, ANY email from an airline about an actual flight/booking
- "coach_announcement": Messages from the coach about practice, team updates, lineups
- "schedule_change": Tournament schedule updates, pool reassignments, venue changes
- "tournament_info": Tournament registration, bracket info, AES updates, check-in details, tournament logistics, event information
- "other": ONLY use for clear marketing/promotions (loyalty point offers, credit card upsells, sale announcements, newsletters, furniture stores, sports news). If in doubt, do NOT classify as "other"

IMPORTANT: Emails from airlines (Delta, Southwest, United, etc.) or hotels (Marriott, Hilton, etc.) that reference a specific trip, flight, stay, confirmation number, or date are NEVER "other" — they are "travel_confirmation" or "stay_and_play".

Extract ALL pertinent structured data from the email. Be thorough:
- For stay_and_play: hotel_name, check_in_date (YYYY-MM-DD), check_out_date (YYYY-MM-DD), confirmation_number, nightly_rate, total_cost, cancellation_deadline (YYYY-MM-DD), address, phone, booking_url, number_of_nights
- For travel_confirmation (flights): airline, flight_number, departure_date (YYYY-MM-DD), departure_time (HH:MM), arrival_time (HH:MM), departure_airport (3-letter code), arrival_airport (3-letter code), departure_city, arrival_city, confirmation_number, passenger_name, booking_url. For round trips, extract BOTH legs as "outbound" and "return" objects with the same fields. Parse dates from ANY format (e.g., "19MAR26" = 2026-03-19, "Mar 19, 2026" = 2026-03-19).
- For schedule_change/tournament_info: tournament_name, start_date, end_date, location_city, venue_name, venue_address, pool_info, check_in_time, schedule_url
- For tournament_info: also extract ticket_code, ticket_url (URLs containing "ticket", "aes", "gofan", "aesathletics", or similar), registration_deadline, entry_fee
- For coach_announcement: key message summary, any dates/times mentioned, action_items

IMPORTANT — Schedule and ticket timing:
- If the email mentions WHEN schedules will be posted (e.g., "Schedule will be posted Wednesday prior to the event", "Pools released the Monday before"), extract as "schedule_available_description" (the raw text) AND compute "schedule_available_date" as an ISO date (YYYY-MM-DD) by calculating from the tournament start_date. For example, if start_date is 2026-03-14 (Saturday) and schedule posts "Wednesday prior", that's 2026-03-11.
- If the email mentions WHEN ticket sales start (e.g., "Tickets on sale March 1", "Spectator tickets available two weeks before"), extract as "ticket_sales_description" (raw text) AND compute "ticket_sales_date" as ISO date (YYYY-MM-DD).

Include only fields that are actually present in the email. Use ISO date format (YYYY-MM-DD) for dates when possible.

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

  if (!claudeApiKey) return result;

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
    console.error(`Claude API failed (${claudeResponse.status}): ${errorText.slice(0, 200)}`);
    // Don't default to "other" — mark as unclassified so it still gets stored
    result.classification = 'unclassified';
    result.summary = 'AI classification unavailable — needs manual review';
  }

  return result;
}
