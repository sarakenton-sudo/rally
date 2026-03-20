const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseMonth(s: string): string | null {
  return MONTH_MAP[s.toLowerCase()] || null;
}

function inferYear(month: string): string {
  const m = parseInt(month);
  return m >= 8 ? '2025' : '2026';
}

export interface ExtractedTournament {
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venue_name: string;
  venue_address: string;
  notes: string;
}

/**
 * Parse "13-Dec", "11- Jan", "7-Feb" style dates (day-month-abbrev, no year).
 * Returns { month: "12", day: "13" } or null.
 */
function parseDayMonthAbbrev(s: string): { month: string; day: string } | null {
  const cleaned = s.replace(/\s+/g, '').trim();
  const m = cleaned.match(/^(\d{1,2})-([A-Za-z]{3,})$/);
  if (!m) return null;
  const month = parseMonth(m[2]);
  if (!month) return null;
  return { month, day: String(parseInt(m[1])).padStart(2, '0') };
}

/**
 * Detect and extract tournaments from tab-separated spreadsheet data.
 * Returns null if the text doesn't look like TSV (falls through to freeform parser).
 */
function tsvExtract(text: string): ExtractedTournament[] | null {
  const lines = text.split('\n').map((l) => l.trimEnd());
  // Need at least 2 lines (header + data, or 2 data rows)
  if (lines.length < 2) return null;

  // Try both delimiters and pick the one that works best
  const delimiters: { delim: string | RegExp; label: string }[] = [];
  if (lines[0].includes('\t')) {
    delimiters.push({ delim: '\t', label: 'tab' });
  }
  if (lines[0].match(/\s{2,}/)) {
    delimiters.push({ delim: /\s{2,}/, label: 'spaces' });
  }
  if (delimiters.length === 0) return null;

  // Try each delimiter — return the first one that produces valid results
  for (const { delim } of delimiters) {
    const result = tryDelimiterExtract(lines, delim);
    if (result && result.length > 0) return result;
  }
  return null;
}

function tryDelimiterExtract(lines: string[], delimiter: string | RegExp): ExtractedTournament[] | null {
  const splitLine = (line: string) =>
    typeof delimiter === 'string'
      ? line.split(delimiter).map((c) => c.trim())
      : line.split(delimiter).map((c) => c.trim()).filter(Boolean);

  // Clean cells: strip "Week #XX" and trailing age group junk at the cell level
  const isWeekCell = (c: string) => /^Week\s*#?\s*\d+$/i.test(c);
  const isAgeGroupCell = (c: string) => /^(All|\?{2,}|\d{1,2}s?[,\s-]+\d{1,2}s?(?:[,\s]+\d{1,2}s?)*(?:[,\s]+\w{1,6})*|\d{1,2}\s+\w{2,6})$/i.test(c.trim());

  const cleanCells = (cells: string[]) => {
    // Remove leading Week cells
    while (cells.length > 0 && isWeekCell(cells[0])) cells.shift();
    // Remove trailing age group cells
    while (cells.length > 0 && isAgeGroupCell(cells[cells.length - 1])) cells.pop();
    return cells;
  };

  const headerLine = lines[0];
  const rawHeaderCells = splitLine(headerLine);
  const headerCells = cleanCells([...rawHeaderCells]).map((c) => c.toLowerCase());

  // Map headers to our fields — order matters: more specific patterns first
  const colMap: Record<string, number> = {};
  const headerPatterns: [string, RegExp][] = [
    ['name', /^(event|tournament|name|tourney)$/i],
    ['start_date', /^(start\s*date|start|date|begins?)$/i],
    ['end_date', /^(end\s*date|end|ends?)$/i],
    ['location_city', /^(location|city|location\s*city|where|site)$/i],
    ['venue_name', /^(hotel\s*name|venue|venue\s*name|facility)$/i],
    ['hotel_cost', /^(hotel\s*cost|hotel\s*price|lodging\s*cost)$/i],
    ['air_cost', /^(air\s*cost|flight\s*cost|air\s*price)$/i],
    ['hotel_checkin', /^(hotel\s*check\s*-?\s*in|check\s*-?\s*in|checkin)$/i],
    ['hotel_checkout', /^(hotel\s*check\s*-?\s*out|check\s*-?\s*out|checkout)$/i],
    ['hotel_booked_through', /^(hotel\s*booked\s*through|booked\s*through|booking\s*site)$/i],
    ['hotel_booking_name', /^(hotel\s*booking\s*name|booking\s*name|reservation\s*name)$/i],
    ['hotel_details', /^(hotel\s*reservation\s*details|reservation\s*details|hotel\s*details)$/i],
    ['air_details', /^(air\s*details|flight\s*details|air\s*info)$/i],
    // These are last because "hotel" and "air" alone are ambiguous — only match if not already claimed
    ['hotel_needed', /^(hotel|hotel\s*needed|lodging)$/i],
    ['air_needed', /^(air|air\s*needed|flight|fly)$/i],
  ];

  for (let i = 0; i < headerCells.length; i++) {
    for (const [field, pattern] of headerPatterns) {
      if (pattern.test(headerCells[i]) && !(field in colMap)) {
        colMap[field] = i;
        break;
      }
    }
  }

  // If no headers were recognized, try to infer column positions from the data
  if (!('name' in colMap)) {
    // If our "header" row actually has date-like values, it's probably a headerless data set
    const firstRowHasDates = headerCells.some((c) => parseDayMonthAbbrev(c) !== null || /^\d{1,2}\/\d{1,2}/.test(c));

    if (firstRowHasDates && headerCells.length >= 3) {
      // Headerless: infer columns by position from first data row
      const inferredMap: Record<string, number> = {};
      let dateColCount = 0;
      for (let ci = 0; ci < headerCells.length; ci++) {
        const sample = headerCells[ci];
        if (!sample) continue;
        const isDate = parseDayMonthAbbrev(sample) !== null || /^\d{1,2}\/\d{1,2}/.test(sample);
        if (isDate && dateColCount === 0) {
          inferredMap.start_date = ci;
          dateColCount++;
        } else if (isDate && dateColCount === 1) {
          inferredMap.end_date = ci;
          dateColCount++;
        } else if (!('name' in inferredMap) && !isDate && sample.length > 2) {
          inferredMap.name = ci;
        } else if ('name' in inferredMap && !('location_city' in inferredMap) && !isDate && sample.length > 1) {
          inferredMap.location_city = ci;
        }
      }

      if ('name' in inferredMap) {
        const tournaments: ExtractedTournament[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          const cells = cleanCells(splitLine(line));
          const tName = cells[inferredMap.name] || '';
          if (!tName || tName.length < 2) continue;
          if (/^(event|tournament|name|tourney|start\s*date|date)$/i.test(tName)) continue;

          let startDate = inferredMap.start_date !== undefined ? parseFlexDate(cells[inferredMap.start_date] || '') : '';
          let endDate = inferredMap.end_date !== undefined ? parseFlexDate(cells[inferredMap.end_date] || '') : '';
          if (!endDate && startDate) endDate = startDate;
          if (!startDate) continue;

          const locationCity = inferredMap.location_city !== undefined ? cells[inferredMap.location_city] || '' : '';

          tournaments.push({
            name: tName,
            start_date: startDate,
            end_date: endDate,
            location_city: locationCity,
            venue_name: '',
            venue_address: '',
            notes: '',
          });
        }
        return tournaments.length > 0 ? tournaments : null;
      }
    }

    return null;
  }

  const tournaments: ExtractedTournament[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = cleanCells(splitLine(line));

    const name = cells[colMap.name] || '';
    if (!name || name.length < 2) continue;

    // Skip rows that look like duplicate header rows
    const nameLower = name.toLowerCase();
    if (/^(event|tournament|name|tourney|start\s*date|date)$/.test(nameLower)) continue;

    // Parse dates — handle "13-Dec", "11- Jan", "1/17/2026", "Jan 17, 2026", etc.
    let startDate = '';
    let endDate = '';

    const rawStart = colMap.start_date !== undefined ? cells[colMap.start_date] || '' : '';
    const rawEnd = colMap.end_date !== undefined ? cells[colMap.end_date] || '' : '';

    startDate = parseFlexDate(rawStart);
    endDate = parseFlexDate(rawEnd);

    // If no end date, default to start date
    if (!endDate && startDate) endDate = startDate;
    // If neither date, skip this row
    if (!startDate) continue;

    const locationCity = colMap.location_city !== undefined ? cells[colMap.location_city] || '' : '';
    const venueName = colMap.venue_name !== undefined ? cells[colMap.venue_name] || '' : '';

    // Build notes from extra columns
    const noteParts: string[] = [];
    if (colMap.hotel_needed !== undefined && cells[colMap.hotel_needed]) {
      noteParts.push(`Hotel: ${cells[colMap.hotel_needed]}`);
    }
    if (colMap.air_needed !== undefined && cells[colMap.air_needed]) {
      noteParts.push(`Air: ${cells[colMap.air_needed]}`);
    }
    if (colMap.hotel_cost !== undefined && cells[colMap.hotel_cost]) {
      noteParts.push(`Hotel cost: ${cells[colMap.hotel_cost]}`);
    }
    if (colMap.air_cost !== undefined && cells[colMap.air_cost]) {
      noteParts.push(`Air cost: ${cells[colMap.air_cost]}`);
    }

    tournaments.push({
      name,
      start_date: startDate,
      end_date: endDate,
      location_city: locationCity,
      venue_name: venueName,
      venue_address: '',
      notes: noteParts.join(' | '),
    });
  }

  return tournaments.length > 0 ? tournaments : null;
}

/**
 * Parse a date string flexibly: "13-Dec", "11- Jan", "1/17/2026", "Jan 17, 2026", "2026-01-17"
 */
function parseFlexDate(raw: string): string {
  if (!raw) return '';

  // Try "13-Dec" / "11- Jan" (day-month-abbrev)
  const dma = parseDayMonthAbbrev(raw);
  if (dma) {
    const year = inferYear(dma.month);
    return `${year}-${dma.month}-${dma.day}`;
  }

  // Try ISO "2026-01-17"
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(parseInt(isoMatch[2])).padStart(2, '0')}-${String(parseInt(isoMatch[3])).padStart(2, '0')}`;
  }

  // Try "1/17/2026" or "1/17"
  const numMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (numMatch) {
    const m = String(parseInt(numMatch[1])).padStart(2, '0');
    const d = String(parseInt(numMatch[2])).padStart(2, '0');
    let y = numMatch[3] || inferYear(m);
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }

  // Try "Jan 17, 2026" or "January 17"
  const nameMatch = raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*,?\s*(\d{4})?$/i);
  if (nameMatch) {
    const month = parseMonth(nameMatch[1])!;
    const day = String(parseInt(nameMatch[2])).padStart(2, '0');
    const year = nameMatch[3] || inferYear(month);
    return `${year}-${month}-${day}`;
  }

  return '';
}

/**
 * Reconstruct rows from a single-line tab-separated paste.
 * When spreadsheet data loses newlines, all cells end up on one line separated by tabs.
 * We detect the column count from headers and split into rows.
 */
function reconstructRows(text: string): string {
  // Strip Week #XX cells before reconstruction
  const cleaned = text.replace(/Week\s*#?\s*\d+\s*[\t]/gi, '');
  const cells = cleaned.split('\t').map((c) => c.trim());
  if (cells.length < 4) return text;

  // Try to detect header row by finding where date-like values start
  // Headers are text-only, data rows have date-like values
  let colCount = 0;
  for (let i = 0; i < cells.length; i++) {
    const isDate = parseDayMonthAbbrev(cells[i]) !== null ||
      /^\d{1,2}\/\d{1,2}/.test(cells[i]) ||
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(cells[i]);
    if (isDate && i >= 2) {
      // First date cell — everything before this was the header row
      colCount = i;
      break;
    }
  }

  // If we couldn't detect from dates, try to find repeating header-like patterns
  if (colCount === 0) {
    // Look for common header words
    const headerWords = /^(start\s*date|end\s*date|event|tournament|location|hotel|air|name|city|venue|date|start|end)/i;
    let headerCount = 0;
    for (let i = 0; i < Math.min(cells.length, 20); i++) {
      if (headerWords.test(cells[i])) {
        headerCount++;
      } else if (headerCount >= 2) {
        colCount = i;
        break;
      }
    }
  }

  if (colCount < 2) return text;

  // Split cells into rows of colCount
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += colCount) {
    rows.push(cells.slice(i, i + colCount).join('\t'));
  }

  return rows.join('\n');
}

/**
 * Parse simple one-per-line tournament format:
 * "Tourney 1 April 4 Austin Tx"
 * "Tourney 2 April 18/19 Tomball Tx"
 * "Tourney 3 May 2/3 Austin Tx"
 *
 * Pattern: {name} {month} {day}[/{day}] {city} {state}
 */
function simpleLineExtract(text: string): ExtractedTournament[] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const US_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  ]);

  // Pattern A: name ... Month Day[/Day] City State (optional note)
  const linePatternWithName = /^(.+?)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:\/(\d{1,2}))?\s+(.+?)\s+([A-Za-z]{2})\s*(?:\((.+?)\))?\s*$/i;
  // Pattern B: Month Day[/Day] City State (no name — date first)
  const linePatternDateFirst = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:\/(\d{1,2}))?\s+(.+?)\s+([A-Za-z]{2})\s*(?:\((.+?)\))?\s*$/i;

  const tournaments: ExtractedTournament[] = [];
  let matchCount = 0;

  for (const line of lines) {
    // Try name-first pattern
    const m = line.match(linePatternWithName);
    if (m) {
      const name = m[1].trim().replace(/[-–—,\s]+$/, '');
      const month = parseMonth(m[2]);
      if (!month) continue;

      const startDay = String(parseInt(m[3])).padStart(2, '0');
      const endDay = m[4] ? String(parseInt(m[4])).padStart(2, '0') : startDay;
      const city = m[5].trim();
      const state = m[6].toUpperCase();
      const parenNote = m[7]?.trim() || '';

      if (!US_STATES.has(state)) continue;

      const year = inferYear(month);
      matchCount++;
      tournaments.push({
        name,
        start_date: `${year}-${month}-${startDay}`,
        end_date: `${year}-${month}-${endDay}`,
        location_city: `${city}, ${state}`,
        venue_name: '',
        venue_address: '',
        notes: parenNote,
      });
      continue;
    }

    // Try date-first pattern (no tournament name)
    const d = line.match(linePatternDateFirst);
    if (d) {
      const month = parseMonth(d[1]);
      if (!month) continue;

      const startDay = String(parseInt(d[2])).padStart(2, '0');
      const endDay = d[3] ? String(parseInt(d[3])).padStart(2, '0') : startDay;
      const city = d[4].trim();
      const state = d[5].toUpperCase();
      const parenNote = d[6]?.trim() || '';

      if (!US_STATES.has(state)) continue;

      const year = inferYear(month);
      const startDate = `${year}-${month}-${startDay}`;
      const endDate = `${year}-${month}-${endDay}`;
      const dateLabel = `${d[1]} ${d[2]}${d[3] ? '/' + d[3] : ''}`;

      matchCount++;
      tournaments.push({
        name: `${city} — ${dateLabel}`,
        start_date: startDate,
        end_date: endDate,
        location_city: `${city}, ${state}`,
        venue_name: '',
        venue_address: '',
        notes: parenNote,
      });
      continue;
    }
  }

  // Only return if we matched at least half the non-empty lines (to avoid false positives)
  if (matchCount === 0 || matchCount < lines.length * 0.4) return null;
  return tournaments;
}

/**
 * Parse PlayMetrics calendar paste format.
 * Structure: day-abbrev line, day-number line, team name, event description, time, location.
 * Month headers like "April 2026" set the current month context.
 * Only extracts game events (containing "vs"). Skips practices, fundraisers, etc.
 *
 * The paste may start mid-block (no day-abbrev for the first event),
 * contain huge embedded content (flyers, rules docs), and have trailing HTML.
 */
function playMetricsExtract(text: string): ExtractedTournament[] | null {
  // Normalize: strip zero-width chars, BOM, and other invisible Unicode
  const cleaned = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').map((l) => l.replace(/[^\x20-\x7E\u00C0-\u024F]/g, '').trim());
  const dayAbbrevRe = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i;
  const monthYearRe = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i;

  // Detect: need at least 2 day-abbreviation-then-number pairs
  let dayNumConfirms = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (dayAbbrevRe.test(lines[i]) && /^\d{1,2}$/.test(lines[i + 1])) {
      dayNumConfirms++;
    }
  }
  if (dayNumConfirms < 2) return null;

  // Step 1: Find all event block start positions (day-abbrev + day-number)
  interface EventBlock { dayAbbrev: string; dayNum: number; startIdx: number; }
  const blocks: EventBlock[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (dayAbbrevRe.test(lines[i]) && /^\d{1,2}$/.test(lines[i + 1])) {
      blocks.push({ dayAbbrev: lines[i], dayNum: parseInt(lines[i + 1]), startIdx: i });
    }
  }

  // Step 2: Scan forward through month headers to infer month for each block.
  // First, find all month headers and their positions.
  const monthHeaders: { month: string; year: string; lineIdx: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const mh = lines[i].match(monthYearRe);
    if (mh) {
      monthHeaders.push({ month: parseMonth(mh[1]) || '', year: mh[2], lineIdx: i });
    }
  }

  // Also scan for inline "Month Year" in lines like "December 2025 – April 2026"
  // that might appear in embedded content — we only use standalone month headers.

  // Infer initial month: if there's a month header before the first block, use it.
  // Otherwise, look at the first month header after and work backwards.
  // Common case: the paste starts in the middle of a month with no header.
  function getMonthYear(blockLineIdx: number): { month: string; year: string } | null {
    // Find the most recent month header at or before this line
    let best: { month: string; year: string } | null = null;
    for (const mh of monthHeaders) {
      if (mh.lineIdx < blockLineIdx) {
        best = { month: mh.month, year: mh.year };
      }
    }
    if (best) return best;

    // No header before this block. Look at the first header after and infer.
    // If the first header is "April 2026" and events before it have day numbers >= 20,
    // they're likely in March 2026.
    if (monthHeaders.length > 0) {
      const first = monthHeaders[0];
      const m = parseInt(first.month);
      const prevMonth = m === 1 ? '12' : String(m - 1).padStart(2, '0');
      const prevYear = m === 1 ? String(parseInt(first.year) - 1) : first.year;
      return { month: prevMonth, year: prevYear };
    }

    return null;
  }

  // Step 3: For each block, collect its content lines and check for "vs"
  const tournaments: ExtractedTournament[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const contentStart = block.startIdx + 2; // skip day-abbrev and day-number lines
    const contentEnd = bi + 1 < blocks.length
      ? blocks[bi + 1].startIdx
      : lines.length;

    // Collect content lines, but stop at month headers (they start a new section)
    // and limit to ~10 lines to skip embedded junk (flyers, rules, etc.)
    const blockLines: string[] = [];
    for (let j = contentStart; j < contentEnd && blockLines.length < 10; j++) {
      const l = lines[j];
      if (!l) continue;
      if (monthYearRe.test(l)) break;
      // Stop if we hit markdown headers or obvious non-calendar content
      if (/^#{1,3}\s/.test(l)) break;
      // Stop at HTML tags
      if (/^<\w+/.test(l)) break;
      blockLines.push(l);
    }

    // Only care about game events — must have "vs" in a line
    const vsLine = blockLines.find((l) => /\bvs\.?\b/i.test(l));
    if (!vsLine) continue;

    const my = getMonthYear(block.startIdx);
    if (!my) continue;

    const day = String(block.dayNum).padStart(2, '0');
    const dateStr = `${my.year}-${my.month}-${day}`;

    // Extract time line
    const timeLine = blockLines.find((l) => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(l));
    const timeNote = timeLine && !/TBD/i.test(timeLine) ? timeLine : '';

    // Location: lines after the team name and event type that aren't the time
    // Typically: team name, event desc (vs), time, location
    const vsIdx = blockLines.indexOf(vsLine);
    const afterVs = blockLines.slice(vsIdx + 1);
    const locationLines = afterVs.filter((l) =>
      l !== timeLine &&
      l.length > 1 &&
      !/^TBD$/i.test(l) &&
      !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(l) &&
      !/^\d{1,2}$/.test(l)
    );
    // Clean "TBD (Arrive by TBD)" from location
    const location = locationLines
      .map((l) => l.replace(/\s*\(Arrive by .*?\)/i, '').trim())
      .filter((l) => l && !/^TBD$/i.test(l))
      .join(', ');

    const name = vsLine;
    const noteParts: string[] = [];
    if (timeNote) noteParts.push(timeNote);
    // Include arrive-by note if present
    const arriveBy = afterVs.find((l) => /Arrive by/i.test(l));
    if (arriveBy) {
      const arriveMatch = arriveBy.match(/\(Arrive by (.+?)\)/i);
      if (arriveMatch && !/TBD/i.test(arriveMatch[1])) {
        noteParts.push(`Arrive by ${arriveMatch[1]}`);
      }
    }

    tournaments.push({
      name,
      start_date: dateStr,
      end_date: dateStr,
      location_city: '',
      venue_name: location,
      venue_address: '',
      notes: noteParts.join(' | '),
    });
  }

  return tournaments.length > 0 ? tournaments : null;
}

/**
 * Smart local extraction — handles various messy real-world formats:
 * - PlayMetrics calendar paste (day abbreviations + day numbers)
 * - Tab-separated spreadsheet data (from Google Sheets, Excel, etc.)
 * - "Name - Date - City - Venue" (dash-separated)
 * - "Name, Date, City" (comma-separated)
 * - "1. Name  Jan 17-19, 2026  Dallas, TX" (whitespace-separated)
 * - "Name @ Venue, City, ST  Month Day-Day, Year"
 * - Coach GroupMe messages, forwarded emails, etc.
 */
export function smartExtract(text: string): ExtractedTournament[] {
  // Pre-process: if pasted data lost newlines but has tabs, try to reconstruct rows
  let processed = text;
  const lineCount = text.split('\n').length;
  const tabCount = (text.match(/\t/g) || []).length;

  if (lineCount <= 2 && tabCount >= 6) {
    // Likely a spreadsheet paste that lost newlines
    // Try to detect header count and split into rows
    processed = reconstructRows(text);
  }

  // Try PlayMetrics calendar format first (day-abbrev + day-number blocks)
  const playMetricsResult = playMetricsExtract(text);
  if (playMetricsResult) return playMetricsResult;

  // Try TSV/spreadsheet format
  const tsvResult = tsvExtract(processed);
  if (tsvResult) return tsvResult;

  // Try simple one-per-line format: "Name Month Day[/Day] City State"
  const simpleLineResult = simpleLineExtract(text);
  if (simpleLineResult) return simpleLineResult;

  const tournaments: ExtractedTournament[] = [];
  const lines = text.split('\n');

  const monthNameDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*[-–—to]+\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+)?(\d{1,2})\s*,?\s*(\d{4})?\b/i;
  const singleDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*,?\s*(\d{4})?\b/i;
  const numericDateRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const stateRe = /\b([A-Z][a-zA-Z\s.]+),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 5) continue;

    // Skip markdown list items, headers, and promotional/rules content
    if (/^[\*\-•]\s/.test(line)) continue;
    if (/^#{1,3}\s/.test(line)) continue;
    if (/^---+$/.test(line)) continue;
    // Skip lines with bold markdown labels (e.g., "**Eligible Spirit Nights:** Dec 1...")
    if (/\*\*[^*]+\*\*/.test(line) && !/tournament|qualifier|championship|classic|cup|invitational|open\b/i.test(line)) continue;
    // Skip lines that are clearly labels/descriptions with dates embedded
    if (/(?:Eligible|Competition|Winners|Leaderboard|Timeline|Prize|Rules|How to|Tips|Bonus|Spirit Night|Announced|Updates)/i.test(line)) continue;

    let startDate = '';
    let endDate = '';
    let dateMatchStr = '';

    const rangeMatch = line.match(monthNameDateRe);
    if (rangeMatch) {
      const startMonth = parseMonth(rangeMatch[1])!;
      const startDay = parseInt(rangeMatch[2]);
      const endMonthStr = rangeMatch[3];
      const endDay = parseInt(rangeMatch[4]);
      const year = rangeMatch[5] || inferYear(startMonth);
      const endMonth = endMonthStr ? parseMonth(endMonthStr)! : startMonth;
      startDate = `${year}-${startMonth}-${String(startDay).padStart(2, '0')}`;
      endDate = `${year}-${endMonth}-${String(endDay).padStart(2, '0')}`;
      dateMatchStr = rangeMatch[0];
    } else {
      const numMatch = line.match(numericDateRe);
      if (numMatch) {
        const sm = String(parseInt(numMatch[1])).padStart(2, '0');
        const sd = String(parseInt(numMatch[2])).padStart(2, '0');
        const em = String(parseInt(numMatch[4])).padStart(2, '0');
        const ed = String(parseInt(numMatch[5])).padStart(2, '0');
        let sy = numMatch[3] || inferYear(sm);
        let ey = numMatch[6] || inferYear(em);
        if (sy.length === 2) sy = '20' + sy;
        if (ey.length === 2) ey = '20' + ey;
        startDate = `${sy}-${sm}-${sd}`;
        endDate = `${ey}-${em}-${ed}`;
        dateMatchStr = numMatch[0];
      } else {
        const singleMatch = line.match(singleDateRe);
        if (singleMatch) {
          const month = parseMonth(singleMatch[1])!;
          const day = parseInt(singleMatch[2]);
          const year = singleMatch[3] || inferYear(month);
          startDate = `${year}-${month}-${String(day).padStart(2, '0')}`;
          endDate = startDate;
          dateMatchStr = singleMatch[0];
        } else {
          continue;
        }
      }
    }

    const dateIdx = line.indexOf(dateMatchStr);
    let beforeDate = dateIdx > 0 ? line.substring(0, dateIdx) : '';
    let afterDate = line.substring(dateIdx + dateMatchStr.length);

    let name = beforeDate
      .replace(/^\s*[\d]+[.):\s]+/, '')
      .replace(/[-–—,\s]+$/, '')
      .replace(/^\s*[-–—•*]\s*/, '')
      .trim();

    if (name.length < 3) {
      if (i > 0 && lines[i - 1].trim().length > 3) {
        const prevLine = lines[i - 1].trim();
        if (!prevLine.match(monthNameDateRe) && !prevLine.match(numericDateRe)) {
          name = prevLine.replace(/^\s*[\d]+[.):\s]+/, '').replace(/[-–—,:\s]+$/, '').trim();
        }
      }
      if (name.length < 3) continue;
    }

    let locationCity = '';
    let venueName = '';
    const remaining = afterDate;

    const cityMatch = remaining.match(stateRe);
    if (cityMatch) {
      locationCity = `${cityMatch[1].trim()}, ${cityMatch[2]}`;
      const cityIdx = remaining.indexOf(cityMatch[0]);
      const afterCity = remaining.substring(cityIdx + cityMatch[0].length);
      venueName = afterCity.replace(/^\s*[-–—,@]+\s*/, '').replace(/[-–—,\s]+$/, '').trim();
    } else {
      const parts = remaining.split(/\s*[-–—]\s*/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
      if (parts.length >= 1) locationCity = parts[0].replace(/^,\s*/, '');
      if (parts.length >= 2) venueName = parts[1];
    }

    if (!locationCity) {
      const dashParts = line.split(/\s*[-–—]\s*/);
      if (dashParts.length >= 3) locationCity = dashParts[2]?.trim() || '';
      if (dashParts.length >= 4 && !venueName) venueName = dashParts[3]?.trim() || '';
    }

    venueName = venueName.replace(/^\s*[-–—@,]+\s*/, '').replace(/\s*[-–—,]+\s*$/, '').trim();

    if (tournaments.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;

    tournaments.push({
      name,
      start_date: startDate,
      end_date: endDate,
      location_city: locationCity,
      venue_name: venueName,
      venue_address: '',
      notes: '',
    });
  }

  return tournaments;
}
