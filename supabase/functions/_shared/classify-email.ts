const CLASSIFICATION_PROMPT = `You are an email classifier for a youth volleyball team management app called Rally.

Classify the email into exactly ONE category:
- "stay_and_play": Hotel booking confirmation, stay-and-play deals, hotel block info
- "travel_confirmation": Flight confirmation, car rental, travel itinerary
- "coach_announcement": Messages from the coach about practice, team updates, lineups
- "schedule_change": Tournament schedule updates, pool reassignments, venue changes
- "tournament_info": Tournament registration, bracket info, AES updates, check-in details
- "other": Anything that doesn't fit the above

Extract ALL pertinent structured data from the email. Be thorough:
- For stay_and_play/travel_confirmation: hotel_name, check_in_date, check_out_date, confirmation_number, nightly_rate, total_cost, cancellation_deadline, address, phone, booking_url
- For travel_confirmation (flights): airline, flight_number, departure_date, departure_time, arrival_time, departure_airport, arrival_airport, confirmation_number, booking_url
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
        content: `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 4000)}`,
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
      console.error('Failed to parse Claude classification response');
    }
  }

  return result;
}
