import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { classifyEmail } from '../_shared/classify-email.ts';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? '';

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
    const { from, subject, body, schedule_url } = await req.json();

    if (!from && !subject && !body) {
      return jsonResponse({ error: 'Missing email content' }, 400);
    }

    // Classify the email
    const result = await classifyEmail(CLAUDE_API_KEY, from ?? '', subject ?? '', body ?? '');

    // If a schedule_url was found and we don't have schedule_available_date, try fetching the URL
    const scheduleUrl = schedule_url || String(result.extractedData?.schedule_url ?? '');
    if (scheduleUrl && !result.extractedData?.schedule_available_date) {
      try {
        const pageResponse = await fetch(scheduleUrl, {
          headers: { 'User-Agent': 'RallyHUB/1.0' },
          redirect: 'follow',
        });
        if (pageResponse.ok) {
          const pageText = await pageResponse.text();
          // Strip HTML and truncate
          const cleanText = pageText
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);

          if (cleanText.length > 50) {
            // Ask Claude to extract schedule dates from the page content
            const dateResult = await extractDatesFromPage(CLAUDE_API_KEY, cleanText, scheduleUrl);
            if (dateResult.schedule_available_date) {
              result.extractedData.schedule_available_date = dateResult.schedule_available_date;
            }
            if (dateResult.schedule_available_description) {
              result.extractedData.schedule_available_description = dateResult.schedule_available_description;
            }
            if (dateResult.ticket_sales_date) {
              result.extractedData.ticket_sales_date = dateResult.ticket_sales_date;
            }
            if (dateResult.ticket_sales_description) {
              result.extractedData.ticket_sales_description = dateResult.ticket_sales_description;
            }
          }
        }
      } catch (fetchErr) {
        console.error('Failed to fetch schedule URL:', fetchErr);
      }
    }

    return jsonResponse({
      classification: result.classification,
      action: result.action,
      summary: result.summary,
      extracted_data: result.extractedData,
    });
  } catch (err) {
    console.error('Classify email error:', err);
    return jsonResponse({ error: 'Classification failed' }, 500);
  }
});

async function extractDatesFromPage(
  apiKey: string,
  pageText: string,
  url: string,
): Promise<Record<string, string>> {
  if (!apiKey) return {};

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `You are extracting schedule and ticket timing information from a tournament/event webpage.
Look for:
- When the schedule/pools/brackets will be posted (e.g., "Schedule posted Wednesday before event")
- When ticket sales start
- Any other timing information about schedule availability

Respond with JSON only. Include only fields you find:
{
  "schedule_available_date": "YYYY-MM-DD (computed if possible)",
  "schedule_available_description": "raw text about when schedule posts",
  "ticket_sales_date": "YYYY-MM-DD",
  "ticket_sales_description": "raw text about ticket sales timing"
}
If no relevant dates found, respond with {}`,
      messages: [{
        role: 'user',
        content: `URL: ${url}\n\nPage content:\n${pageText}`,
      }],
    }),
  });

  if (!response.ok) return {};

  try {
    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? '';
    return JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    return {};
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
