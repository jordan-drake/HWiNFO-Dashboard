import Papa from 'papaparse';
import { sanitizeHeader, parseNumericValue } from './sanitize';

export function parseHWiNFODate(dateStr, timeStr) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  const timeParts = timeStr.split(':');
  if (timeParts.length !== 3) return null;
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  const secParts = timeParts[2].split('.');
  const seconds = parseInt(secParts[0], 10);
  const millis = secParts[1] ? parseInt(secParts[1], 10) : 0;

  return new Date(year, month - 1, day, hours, minutes, seconds, millis);
}

export function disambiguateHeaders(headers) {
  const counts = {};
  const result = [];
  for (const header of headers) {
    const clean = sanitizeHeader(header);
    if (!counts[clean]) {
      counts[clean] = 1;
      result.push(clean);
    } else {
      counts[clean]++;
      result.push(`${clean} (${counts[clean]})`);
    }
  }
  return result;
}

export function parseCSV(csvText) {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: false,
  });

  if (!parsed.data || parsed.data.length < 2) {
    throw new Error('CSV file has insufficient data');
  }

  let rawHeaders = parsed.data[0];

  // Strip trailing empty column from trailing comma
  if (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1].trim() === '') {
    rawHeaders = rawHeaders.slice(0, -1);
  }

  const headers = disambiguateHeaders(rawHeaders);
  const colCount = headers.length;

  const dataRows = [];
  let deviceRow = null;

  for (let i = 1; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    if (!row || row.length === 0) continue;

    const firstCell = row[0] ? row[0].trim() : '';

    // Skip repeated header rows
    if (firstCell === 'Date') continue;

    // Capture hardware description rows (empty first cell with non-empty other cells)
    if (firstCell === '' && row.length > 1 && row.some((c, idx) => idx > 0 && c && c.trim() !== '')) {
      // This is a device-mapping row — capture the last one found
      deviceRow = row;
      continue;
    }

    // Skip rows that are too short to be data
    if (row.length < 2) continue;

    // Must have a valid date in first cell
    if (!firstCell.includes('.')) continue;

    // Trim to column count, stripping any trailing empty column
    const trimmedRow = row.slice(0, colCount);
    const rowObj = {};
    for (let j = 0; j < colCount; j++) {
      rowObj[headers[j]] = trimmedRow[j] !== undefined ? trimmedRow[j] : '';
    }
    dataRows.push(rowObj);
  }

  return { headers, rows: dataRows, deviceRow };
}

export function validateCSV(headers, rows) {
  const hasDate = headers.includes('Date');
  const hasTime = headers.includes('Time');
  if (!hasDate || !hasTime) return { valid: false, error: 'CSV must contain Date and Time columns' };

  const sensorCols = headers.filter(h => h !== 'Date' && h !== 'Time');
  const hasNumeric = sensorCols.some(col => {
    for (const row of rows) {
      const val = parseNumericValue(row[col]);
      if (val !== null) return true;
    }
    return false;
  });

  if (!hasNumeric) return { valid: false, error: 'CSV must contain at least one numeric sensor column' };
  if (rows.length > 500000) return { valid: false, error: 'File too large — maximum 500,000 rows supported' };

  return { valid: true };
}
