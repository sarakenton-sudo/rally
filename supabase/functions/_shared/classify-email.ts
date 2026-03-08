const CLASSIFICATION_PROMPT = `You are an email classifier for a youth volleyball team management app called Rally.

Classify the email into exactly ONE category:
- "stay_and_play": Hotel booking confirmation, stay-and-play deals, hotel block info
- "travel_confirmation": Flight confirmation, car rental, travel itinerary
- "coach_announcement": Messages from the coach about practice, team updates, lineups
- "schedule_change": Tournament schedule updates, pool reassignments, venue changes
- "tournament_info": Tournament registration, bracket info, AES updates, check-in details
- "other": Anything that doesn't fit the above

Also extract any actionable data:
- For stay_and_play/travel_confirmation: hotel name, dates, confirmation number, cost
- For schedule_change/tournament_info: tournament name, dates, location, venue changes
- For tournament_info: also extract any ticket purchase URLs (URLs containing "ticket", "aes", "gofan", "aesathletics", or similar ticketing platforms)
- For coach_announcement: key message summary

Respond with JSON only:
{
  "classification": "one_of_the_categories",
  "action": "booking_alert_sent" | "travel_import_queued" | "notification_sent" | "none",
  "summary": "Brief 1-sentence summary of the email",
  "extracted_data": { ... any structured data extracted, include "ticket_urls": [...] for tournament_info emails ... }
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
