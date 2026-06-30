// Hardware specification database for auto-detected thresholds
// Easily extensible — just add entries to the objects below.

export const CPU_SPECS = {
  "i9-10900K":  { tjMax: 100, tdp: 125, ppt: 250, safeTemp: 85, warnTemp: 80 },
  "i9-13900K":  { tjMax: 100, tdp: 125, ppt: 253, safeTemp: 85, warnTemp: 80 },
  "i9-14900K":  { tjMax: 100, tdp: 125, ppt: 253, safeTemp: 85, warnTemp: 80 },
  "i7-12700K":  { tjMax: 100, tdp: 125, ppt: 190, safeTemp: 85, warnTemp: 80 },
  "i7-13700K":  { tjMax: 100, tdp: 125, ppt: 253, safeTemp: 85, warnTemp: 80 },
  "i5-12600K":  { tjMax: 100, tdp: 125, ppt: 150, safeTemp: 85, warnTemp: 80 },
  "R9-7950X":   { tjMax: 95,  tdp: 170, ppt: 230, safeTemp: 85, warnTemp: 80 },
  "R9-5950X":   { tjMax: 90,  tdp: 105, ppt: 142, safeTemp: 85, warnTemp: 75 },
  "R7-7700X":   { tjMax: 95,  tdp: 105, ppt: 142, safeTemp: 85, warnTemp: 80 },
  "R7-5800X":   { tjMax: 90,  tdp: 105, ppt: 142, safeTemp: 85, warnTemp: 75 },
  "R5-5600X":   { tjMax: 95,  tdp: 65,  ppt: 88,  safeTemp: 85, warnTemp: 75 },
};

export const GPU_SPECS = {
  "RTX 2060":    { maxTemp: 88,  tdp: 160, warnTemp: 80, critTemp: 85 },
  "RTX 2070":    { maxTemp: 89,  tdp: 175, warnTemp: 80, critTemp: 85 },
  "RTX 2080":    { maxTemp: 88,  tdp: 215, warnTemp: 80, critTemp: 85 },
  "RTX 3060":    { maxTemp: 93,  tdp: 170, warnTemp: 83, critTemp: 88 },
  "RTX 3070":    { maxTemp: 93,  tdp: 220, warnTemp: 83, critTemp: 88 },
  "RTX 3080":    { maxTemp: 93,  tdp: 320, warnTemp: 83, critTemp: 88 },
  "RTX 3090":    { maxTemp: 93,  tdp: 350, warnTemp: 83, critTemp: 88 },
  "RTX 4060":    { maxTemp: 90,  tdp: 115, warnTemp: 80, critTemp: 85 },
  "RTX 4070":    { maxTemp: 90,  tdp: 200, warnTemp: 83, critTemp: 87 },
  "RTX 4080":    { maxTemp: 90,  tdp: 320, warnTemp: 83, critTemp: 87 },
  "RTX 4090":    { maxTemp: 90,  tdp: 450, warnTemp: 83, critTemp: 87 },
  "RX 7900 XTX": { maxTemp: 110, tdp: 355, warnTemp: 90, critTemp: 100 },
  "RX 7800 XT":  { maxTemp: 110, tdp: 263, warnTemp: 90, critTemp: 100 },
  "RX 6800 XT":  { maxTemp: 110, tdp: 300, warnTemp: 90, critTemp: 100 },
};

export const GENERIC_CPU_SPECS = {
  tjMax: 100, tdp: 125, ppt: 200, safeTemp: 85, warnTemp: 80,
};

export const GENERIC_GPU_SPECS = {
  maxTemp: 93, tdp: 250, warnTemp: 83, critTemp: 88,
};

/**
 * Fuzzy match a full device string (e.g. "Intel Core i9-10900K") against the spec database.
 * Returns the matched spec object or null.
 */
export function matchCpuSpec(deviceString) {
  if (!deviceString) return null;
  const upper = deviceString.toUpperCase();
  for (const [key, spec] of Object.entries(CPU_SPECS)) {
    if (upper.includes(key.toUpperCase())) {
      return { model: key, ...spec };
    }
  }
  return null;
}

export function matchGpuSpec(deviceString) {
  if (!deviceString) return null;
  const upper = deviceString.toUpperCase();
  // Sort by key length descending so "RTX 4080" matches before "RTX 40"
  const sorted = Object.entries(GPU_SPECS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, spec] of sorted) {
    if (upper.includes(key.toUpperCase())) {
      return { model: key, ...spec };
    }
  }
  return null;
}

/**
 * Parse the device-mapping row from HWiNFO CSV to extract system profile.
 * The device row is the last row of the CSV (after the repeated header row).
 * Each cell maps to the corresponding column header's hardware source.
 *
 * @param {string[]} deviceRowCells - Array of cell values from the device-mapping row
 * @param {string[]} headers - Disambiguated column headers
 * @returns {{ cpu, gpu, motherboard, drives[] }}
 */
export function extractSystemProfile(deviceRowCells, headers) {
  const profile = {
    cpu: null,
    cpuSpec: null,
    gpu: null,
    gpuSpec: null,
    motherboard: null,
    drives: [],
    unknownCpu: false,
    unknownGpu: false,
  };

  if (!deviceRowCells || deviceRowCells.length === 0) return profile;

  const seenDevices = new Set();

  for (let i = 0; i < deviceRowCells.length && i < headers.length; i++) {
    const cell = (deviceRowCells[i] || '').trim();
    if (!cell) continue;

    // CPU detection
    if (!profile.cpu && /CPU\s*\[#\d+\]/i.test(cell)) {
      // Extract the model name: "CPU [#0]: Intel Core i9-10900K: DTS" -> "Intel Core i9-10900K"
      const parts = cell.split(':').map(s => s.trim()).filter(Boolean);
      // parts[0] = "CPU [#0]", parts[1] = "Intel Core i9-10900K", parts[2] = "DTS" etc.
      if (parts.length >= 2) {
        profile.cpu = parts[1];
        profile.cpuSpec = matchCpuSpec(parts[1]);
        if (!profile.cpuSpec) profile.unknownCpu = true;
      }
    }

    // GPU detection
    if (!profile.gpu && /GPU\s*\[#\d+\]/i.test(cell)) {
      const parts = cell.split(':').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // "GPU [#0]: NVIDIA GeForce RTX 2060: Zotac RTX 2060 AMP" -> "NVIDIA GeForce RTX 2060"
        profile.gpu = parts[1];
        profile.gpuSpec = matchGpuSpec(parts[1]);
        if (!profile.gpuSpec) profile.unknownGpu = true;
      }
    }

    // Motherboard detection
    if (!profile.motherboard && /motherboard/i.test(cell)) {
      const parts = cell.split(':').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        profile.motherboard = parts[1];
      }
    }

    // Drive detection via S.M.A.R.T. entries
    if (/S\.M\.A\.R\.T/i.test(cell)) {
      const parts = cell.split(':').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const driveModel = parts[1];
        if (!seenDevices.has(driveModel)) {
          seenDevices.add(driveModel);
          // Try to figure out drive letter from header context
          const header = headers[i] || '';
          profile.drives.push({ model: driveModel, header });
        }
      }
    }
  }

  return profile;
}

/**
 * Extract the raw device-mapping row from unparsed CSV data.
 * The device row is the LAST row that has an empty first cell
 * and contains hardware device identifiers.
 */
export function extractDeviceRow(csvText) {
  // Parse from the end of the file to find the device row
  const lines = csvText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    // Device row starts with a comma (empty first cell)
    if (line.startsWith(',') || line.startsWith(',,')) {
      // Verify it contains device identifiers
      if (/CPU\s*\[#\d+\]|GPU\s*\[#\d+\]|S\.M\.A\.R\.T/i.test(line)) {
        // Split respecting quoted fields
        const cells = [];
        let current = '';
        let inQuotes = false;
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            cells.push(current);
            current = '';
          } else {
            current += ch;
          }
        }
        cells.push(current);
        return cells;
      }
    }
  }
  return null;
}
