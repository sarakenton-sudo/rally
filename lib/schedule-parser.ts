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
 * Smart local extraction — handles various messy real-world formats:
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

  // Try TSV/spreadsheet format first
  const tsvResult = tsvExtract(processed);
  if (tsvResult) return tsvResult;
  const tournaments: ExtractedTournament[] = [];
  const lines = text.split('\n');

  const monthNameDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*[-–—to]+\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+)?(\d{1,2})\s*,?\s*(\d{4})?\b/i;
  const singleDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*,?\s*(\d{4})?\b/i;
  const numericDateRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const stateRe = /\b([A-Z][a-zA-Z\s.]+),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 5) continue;

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
