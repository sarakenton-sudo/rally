export interface ExtractedTournamentDetails {
  tournament_name: string;
  venue_name: string;
  venue_address: string;
  location_city: string;
  ticket_sales_date: string;
  ticket_link: string;
  ticket_system: string;
  schedule_link: string;
  schedule_available_date: string;
  division_info: string;
  notes: string;
}

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseDate(dateStr: string): string {
  // "March 16, 2026" or "Mar 16, 2026"
  const longMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (longMatch) {
    const m = MONTH_MAP[longMatch[1].toLowerCase()];
    if (m) return `${longMatch[3]}-${m}-${longMatch[2].padStart(2, '0')}`;
  }
  // "2026-03-16"
  const isoMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  return dateStr.trim();
}

/**
 * Extract detailed tournament info from emails/messages.
 * Pulls venue, ticket info, schedule links, division, notes, etc.
 */
export function extractTournamentDetails(text: string): ExtractedTournamentDetails {
  const result: ExtractedTournamentDetails = {
    tournament_name: '',
    venue_name: '',
    venue_address: '',
    location_city: '',
    ticket_sales_date: '',
    ticket_link: '',
    ticket_system: '',
    schedule_link: '',
    schedule_available_date: '',
    division_info: '',
    notes: '',
  };

  // --- TOURNAMENT NAME ---
  // Try subject line: "Subject: 2026 Mizuno Northern Lights Qualifier #2 | Important..."
  const subjectMatch = text.match(/(?:subject|re|fwd)[:\s]+(.+?)(?:\s*\||\s*[-–—]\s*(?:important|tournament|info)|\n)/i);
  if (subjectMatch) {
    result.tournament_name = subjectMatch[1].replace(/^\d{4}\s+/, '').replace(/\s*#\d+$/, '').trim();
  }
  // Try first line if it looks like a tournament name (contains qualifier, classic, championship, etc.)
  if (!result.tournament_name) {
    const firstLines = text.split('\n').slice(0, 3);
    for (const line of firstLines) {
      const cleaned = line.trim();
      if (cleaned.length > 5 && cleaned.length < 100 &&
          /(?:qualifier|classic|championship|invitational|national|open|bid|tournament|NIT)/i.test(cleaned)) {
        result.tournament_name = cleaned
          .replace(/^\d{4}\s+/, '')
          .replace(/\s*\|.*$/, '')
          .replace(/\s*[-–—]\s*(?:important|tournament).*$/i, '')
          .trim();
        break;
      }
    }
  }

  // --- VENUE ---
  // Try "Location:\n Venue Name" (label on one line, value on next)
  const locationBlockMatch = text.match(/(?:Location|Venue)\s*[:]\s*\n\s*(.+?)(?:\n|$)/im);
  if (locationBlockMatch) {
    result.venue_name = locationBlockMatch[1].trim();
  }
  // Try inline "Location: Venue Name"
  if (!result.venue_name) {
    const locationInlineMatch = text.match(/(?:Location|Venue)\s*[:]\s*(.+?)(?:\n|$)/i);
    if (locationInlineMatch && locationInlineMatch[1].trim().length > 3) {
      result.venue_name = locationInlineMatch[1].trim();
    }
  }
  // Fallback: find convention center, arena, etc.
  if (!result.venue_name) {
    const venuePatternMatch = text.match(/([\w\s]+(?:Convention Center|Arena|Complex|Fieldhouse|Sports Center|Coliseum|Expo Center|Facility|Sports Plex|Sportsplex))/i);
    if (venuePatternMatch) {
      result.venue_name = venuePatternMatch[1].trim();
    }
  }

  // --- ADDRESS ---
  // Look for street address pattern: "1301 2nd Ave South, Minneapolis, MN 55403"
  const addressMatch = text.match(/(\d{1,5}\s+(?:\d+(?:st|nd|rd|th)\s+)?[\w\s]+(?:Ave(?:nue)?|St(?:reet)?|Blvd|Boulevard|Dr(?:ive)?|Rd|Road|Way|Pkwy|Parkway|Ln|Lane|Ct|Court|South|North|East|West)\b[^,\n]*,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5})/i)
    || text.match(/(\d{1,5}\s+[\w\s]+(?:Ave(?:nue)?|St(?:reet)?|Blvd|Boulevard|Dr(?:ive)?|Rd|Road|Way|Pkwy|Parkway|Ln|Lane|Ct|Court|South|North|East|West)\b[^,\n]*,\s*[\w\s]+,\s*[A-Z]{2})/i);
  if (addressMatch) {
    result.venue_address = addressMatch[1].trim();
    // Extract city, state from address
    const cityStateMatch = result.venue_address.match(/,\s*([\w\s]+),\s*([A-Z]{2})/);
    if (cityStateMatch) {
      result.location_city = `${cityStateMatch[1].trim()}, ${cityStateMatch[2]}`;
    }
  }

  // --- TICKET SALES DATE ---
  // "Ticket sales open: March 16, 2026"
  const ticketDateMatch = text.match(/ticket\s*(?:sales?\s*)?(?:open|available|go\s+on\s+sale|start)[:\s]+(.+?)(?:\n|$)/i)
    || text.match(/(?:on\s+sale|sales?\s+open)[:\s]+(.+?)(?:\n|$)/i);
  if (ticketDateMatch) {
    result.ticket_sales_date = parseDate(ticketDateMatch[1]);
  }

  // --- TICKET LINK ---
  const urlMatches = [...text.matchAll(/https?:\/\/[^\s<>")\]]+/gi)];
  for (const m of urlMatches) {
    const url = m[0].toLowerCase();
    if (url.includes('ticket') || url.includes('spectator') || url.includes('admission') || url.includes('showpass') || url.includes('eventbrite')) {
      result.ticket_link = m[0];
      break;
    }
  }
  // If "click here" is near "ticket", note that the link wasn't extractable
  if (!result.ticket_link && /click\s+here/i.test(text) && /ticket/i.test(text)) {
    // URL was likely in an HTML link - can't extract from plain text
  }

  // --- TICKET SYSTEM ---
  if (/eventbrite/i.test(text)) result.ticket_system = 'Eventbrite';
  else if (/showpass/i.test(text)) result.ticket_system = 'Showpass';
  else if (/electronic\s*ticket/i.test(text)) result.ticket_system = 'Electronic';
  else if (/qr\s*code/i.test(text)) result.ticket_system = 'Electronic (QR)';

  // --- SCHEDULE LINK ---
  // First check URLs
  for (const m of urlMatches) {
    const url = m[0].toLowerCase();
    if (url.includes('schedule') || url.includes('vbschedule') || url.includes('sportwrench') || url.includes('aes')) {
      result.schedule_link = m[0];
      break;
    }
  }
  // Check for named sites mentioned in text
  if (!result.schedule_link) {
    const schedSiteMatch = text.match(/(VBSchedule\.com|SportWrench\.com|AESathletics\.com)/i);
    if (schedSiteMatch) {
      const site = schedSiteMatch[1].toLowerCase();
      if (site.includes('vbschedule')) result.schedule_link = 'https://www.vbschedule.com';
      else if (site.includes('sportwrench')) result.schedule_link = 'https://www.sportwrench.com';
      else if (site.includes('aes')) result.schedule_link = 'https://www.aesathletics.com';
    }
  }

  // --- SCHEDULE AVAILABLE DATE ---
  // "Schedule: Posted March 18, 2026" — exact date
  const schedDateExact = text.match(/schedule[:\s]*(?:posted|available|released)\s+(?:on\s+)?(\w+\s+\d{1,2},?\s*\d{4})/i);
  if (schedDateExact) {
    const parsed = parseDate(schedDateExact[1]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
      result.schedule_available_date = parsed;
    }
  }
  // "Posted on VBSchedule.com on Wednesday night prior to the event" — description, goes to notes
  if (!result.schedule_available_date) {
    const schedDescMatch = text.match(/schedule[:\s]*(?:posted|available|released|will\s+be\s+posted)\s+(?:on\s+)?(?:\w+\.com\s+)?(?:on\s+)?((?:\w+day|the\s+\w+)\s+(?:night\s+)?(?:prior|before)\s+(?:to\s+)?(?:the\s+)?event)/i);
    if (schedDescMatch) {
      // Store as note, not as date field (DB expects YYYY-MM-DD)
      result.notes = result.notes ? result.notes + '\n' : '';
      result.notes += `Schedule: ${schedDescMatch[1].trim()}`;
    }
  }

  // --- DIVISION ---
  const divisionMatch = text.match(/division[:\s]*(.+?)(?:\n|$)/i);
  if (divisionMatch) {
    result.division_info = divisionMatch[1].trim();
  }

  // --- NOTES ---
  const noteParts: string[] = [];

  // Start times
  const startTimeMatch = text.match(/(?:tentative\s+)?start\s*time[:\s]*(.+?)(?:\n|$)/i);
  if (startTimeMatch) noteParts.push(`Start: ${startTimeMatch[1].trim()}`);

  // Division info
  if (result.division_info) noteParts.push(`Division: ${result.division_info}`);

  // Bids
  const bidsMatch = text.match(/bids?\s*(?:available)?[:\s]*(.+?)(?:\n|$)/i);
  if (bidsMatch) noteParts.push(`Bids: ${bidsMatch[1].trim()}`);

  // Warm-up balls
  if (/warm[- ]?up\s+balls?\s+(?:are\s+)?not\s+provided/i.test(text)) {
    noteParts.push('Warm-up balls NOT provided');
  }

  // Ticket pricing
  const adultPass = text.match(/(?:adult|3-day\s*pass)[:\s]*\$(\d+)/i);
  if (adultPass) noteParts.push(`Adult 3-Day: $${adultPass[1]}`);
  const singleDay = text.match(/single\s*day[:\s]*\$(\d+)/i);
  if (singleDay) noteParts.push(`Single Day: $${singleDay[1]}`);

  // Children free
  if (/children?\s*(?:\d+\s*(?:&|and)\s*)?under\s+(?:are\s+)?free/i.test(text)) {
    noteParts.push('Children 6 & under free');
  }

  if (noteParts.length > 0) {
    result.notes = noteParts.join('\n');
  }

  return result;
}
