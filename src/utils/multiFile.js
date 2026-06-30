// Multi-file session loading: folder loading, chronological stitching, gap handling.

import { parseCSV, validateCSV, parseHWiNFODate } from './csvParser';
import { extractDeviceRow, extractSystemProfile } from './hardware-specs';

const MAX_FILES = 20;
const MAX_TOTAL_POINTS = 50000;

/**
 * Check if the Directory Picker API is available.
 */
export function isDirectoryPickerSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

/**
 * Load and stitch multiple CSV files from a folder.
 *
 * @returns {{ headers, rows, fileBreaks[], profiles[], warnings[] }}
 */
export async function loadFolder() {
  const dirHandle = await window.showDirectoryPicker();
  const csvFiles = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.csv')) {
      csvFiles.push(entry);
    }
  }

  if (csvFiles.length === 0) {
    throw new Error('No CSV files found in the selected folder.');
  }

  if (csvFiles.length > MAX_FILES) {
    throw new Error(`Too many files (${csvFiles.length}). Maximum ${MAX_FILES} files supported.`);
  }

  // Read and parse all files
  const parsed = [];
  const warnings = [];

  for (const entry of csvFiles) {
    const file = await entry.getFile();
    const text = await readFileAsWindows1252(file);

    try {
      const result = parseCSV(text);
      const validation = validateCSV(result.headers, result.rows);
      if (!validation.valid) {
        warnings.push(`Skipped ${entry.name}: ${validation.error}`);
        continue;
      }

      // Get first timestamp for sorting
      const firstRow = result.rows[0];
      const firstTime = parseHWiNFODate(firstRow.Date, firstRow.Time);
      const lastRow = result.rows[result.rows.length - 1];
      const lastTime = parseHWiNFODate(lastRow.Date, lastRow.Time);

      // Extract device info
      const deviceRow = extractDeviceRow(text);
      const profile = deviceRow ? extractSystemProfile(deviceRow, result.headers) : null;

      parsed.push({
        name: entry.name,
        headers: result.headers,
        rows: result.rows,
        firstTime,
        lastTime,
        profile,
      });
    } catch (err) {
      warnings.push(`Skipped ${entry.name}: ${err.message}`);
    }
  }

  if (parsed.length === 0) {
    throw new Error('No valid CSV files found in the selected folder.');
  }

  // Sort by first timestamp
  parsed.sort((a, b) => a.firstTime - b.firstTime);

  // Check total data points
  const totalPoints = parsed.reduce((sum, p) => sum + p.rows.length, 0);
  if (totalPoints > MAX_TOTAL_POINTS) {
    throw new Error(
      `Total data points (${totalPoints.toLocaleString()}) exceed the ${MAX_TOTAL_POINTS.toLocaleString()} limit. ` +
      'Please select a folder with fewer or smaller files.'
    );
  }

  // Merge headers from all files
  const allHeadersSet = new Set();
  for (const p of parsed) {
    for (const h of p.headers) allHeadersSet.add(h);
  }
  const mergedHeaders = [...allHeadersSet];

  // Stitch rows with NaN gap markers between files
  const stitchedRows = [];
  const fileBreaks = []; // indices where files transition
  const profiles = [];

  for (let f = 0; f < parsed.length; f++) {
    const file = parsed[f];

    // Insert a gap row (NaN values) between files
    if (f > 0) {
      const gapRow = {};
      for (const h of mergedHeaders) {
        gapRow[h] = NaN;
      }
      // Use the midpoint timestamp between files for the gap
      const prevEnd = parsed[f - 1].lastTime;
      const curStart = file.firstTime;
      const midTime = new Date((prevEnd.getTime() + curStart.getTime()) / 2);
      gapRow.Date = formatDateDDMMYYYY(midTime);
      gapRow.Time = formatTimeHHMMSS(midTime);
      gapRow.__isGap = true;
      stitchedRows.push(gapRow);
    }

    const breakIndex = stitchedRows.length;
    fileBreaks.push({ index: breakIndex, name: file.name, time: file.firstTime });

    for (const row of file.rows) {
      // Ensure all merged headers exist in each row
      const fullRow = {};
      for (const h of mergedHeaders) {
        fullRow[h] = row[h] !== undefined ? row[h] : '';
      }
      stitchedRows.push(fullRow);
    }

    if (file.profile) {
      profiles.push({ file: file.name, profile: file.profile });
    }
  }

  // Check for hardware changes across files
  if (profiles.length > 1) {
    const firstCpu = profiles[0].profile.cpu;
    const firstGpu = profiles[0].profile.gpu;
    for (let i = 1; i < profiles.length; i++) {
      if (profiles[i].profile.cpu && profiles[i].profile.cpu !== firstCpu) {
        warnings.push(`Hardware change detected: ${profiles[i].file} has CPU "${profiles[i].profile.cpu}" (first file: "${firstCpu}")`);
      }
      if (profiles[i].profile.gpu && profiles[i].profile.gpu !== firstGpu) {
        warnings.push(`Hardware change detected: ${profiles[i].file} has GPU "${profiles[i].profile.gpu}" (first file: "${firstGpu}")`);
      }
    }
  }

  return {
    headers: mergedHeaders,
    rows: stitchedRows,
    fileBreaks,
    profiles,
    warnings,
    fileCount: parsed.length,
    totalDuration: parsed.length > 0
      ? parsed[parsed.length - 1].lastTime - parsed[0].firstTime
      : 0,
  };
}

function formatDateDDMMYYYY(date) {
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

function formatTimeHHMMSS(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function readFileAsWindows1252(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'windows-1252');
  });
}
