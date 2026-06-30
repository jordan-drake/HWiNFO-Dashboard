// Auto-detected significant events in sensor data.
// Stores events in a shared array that the UI instance can read to render markers.

import { parseHWiNFODate } from './csvParser';
import { parseNumericValue } from './sanitize';
import { getActiveThresholds } from './thresholds';

/**
 * Detect significant events in parsed CSV data.
 *
 * @param {string[]} headers - Column headers
 * @param {object[]} rows - Parsed data rows
 * @param {object|null} profile - Detected system profile
 * @returns {Array<{ time: Date, type: string, label: string, sensor?: string }>}
 */
export function detectAutoEvents(headers, rows, profile) {
  if (!rows || rows.length < 3) return [];

  const events = [];
  const timestamps = rows.map(r => parseHWiNFODate(r.Date, r.Time));
  const thresholds = getActiveThresholds(profile);

  // Find relevant column indices
  const cpuUsageHeaders = headers.filter(h => /Total CPU Usage/i.test(h) && h.includes('[%]'));
  const gpuLoadHeaders = headers.filter(h => /GPU.*Load/i.test(h) && h.includes('[%]'));
  const throttleHeaders = headers.filter(h =>
    (/Thermal Throttling/i.test(h) ||
     /Performance Limit.*Thermal/i.test(h) ||
     /Critical Temperature/i.test(h)) &&
    h.includes('[Yes/No]')
  );
  const cpuPowerHeaders = headers.filter(h => /CPU Package Power/i.test(h) && h.includes('[W]'));

  // CPU usage spike: <30% to >80% within 4 seconds
  for (const header of cpuUsageHeaders) {
    const values = rows.map(r => parseNumericValue(r[header]));
    for (let i = 1; i < values.length; i++) {
      if (values[i] === null || values[i - 1] === null) continue;
      if (values[i - 1] < 30 && values[i] > 80) {
        const dt = timestamps[i] - timestamps[i - 1];
        if (dt <= 4000) {
          events.push({
            time: timestamps[i],
            type: 'cpu_spike',
            label: 'CPU load spike',
            sensor: header,
            value: values[i],
          });
        }
      }
    }
  }

  // GPU load spike: <20% to >70%
  for (const header of gpuLoadHeaders) {
    const values = rows.map(r => parseNumericValue(r[header]));
    for (let i = 1; i < values.length; i++) {
      if (values[i] === null || values[i - 1] === null) continue;
      if (values[i - 1] < 20 && values[i] > 70) {
        events.push({
          time: timestamps[i],
          type: 'gpu_spike',
          label: 'GPU load spike',
          sensor: header,
          value: values[i],
        });
      }
    }
  }

  // Thermal throttling transitions: No -> Yes
  for (const header of throttleHeaders) {
    for (let i = 1; i < rows.length; i++) {
      const cur = (rows[i][header] || '').trim();
      const prev = (rows[i - 1][header] || '').trim();
      if (cur === 'Yes' && prev === 'No') {
        events.push({
          time: timestamps[i],
          type: 'throttle',
          label: 'Throttling detected',
          sensor: header,
        });
      }
    }
  }

  // CPU power exceeding TDP
  const tdp = profile?.cpuSpec?.tdp || thresholds.cpu?.packagePowerWarn || 125;
  for (const header of cpuPowerHeaders) {
    const values = rows.map(r => parseNumericValue(r[header]));
    let wasAbove = false;
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== null && values[i] > tdp && !wasAbove) {
        events.push({
          time: timestamps[i],
          type: 'above_tdp',
          label: 'Above TDP',
          sensor: header,
          value: values[i],
        });
        wasAbove = true;
      } else if (values[i] !== null && values[i] <= tdp) {
        wasAbove = false;
      }
    }
  }

  // Sort by time
  events.sort((a, b) => a.time - b.time);
  return events;
}
