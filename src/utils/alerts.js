import { parseHWiNFODate } from './csvParser';
import { parseNumericValue } from './sanitize';
import { formatDuration } from './briefing';

// Physically plausible ranges per unit — values outside these are discarded as bad data
const SANE_RANGES = {
  '\u00b0C': { min: -10, max: 150 },
  'V':       { min: 0,   max: 15 },
  'W':       { min: 0,   max: 1000 },
  '%':       { min: 0,   max: 100 },
  'RPM':     { min: 0,   max: 10000 },
  'MHz':     { min: 0,   max: 8000 },
};

function extractUnitFromHeader(header) {
  const m = header.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function applySaneBounds(value, unit) {
  if (value === null) return null;
  const range = SANE_RANGES[unit];
  if (!range) return value;
  if (value < range.min || value > range.max) {
    console.warn(`Discarding out-of-range value ${value} for unit [${unit}] — expected [${range.min}, ${range.max}]`);
    return null;
  }
  return value;
}

// Safe timestamp delta — returns 0 if either timestamp is null/invalid
function tsDelta(ts1, ts2) {
  if (ts1 == null || ts2 == null) return 0;
  const d = ts1 - ts2;
  return d > 0 ? d : 0;
}

const ALERT_EXCLUSIONS = [
  /GPU Thermal Limit/i,
  /\bTjMAX\b(?!.*Distance)/i,
  /GPU Performance Limiters.*avg/i,
];

function isExcluded(header) {
  return ALERT_EXCLUSIONS.some(p => p.test(header));
}

function headerHasUnit(header, unit) {
  return header.includes(`[${unit}]`);
}

function ruleMatchesHeader(rule, header) {
  if (!rule.match.test(header)) return false;
  if (rule.notMatch && rule.notMatch.test(header)) return false;
  if (rule.unitFilter && !headerHasUnit(header, rule.unitFilter)) return false;
  return true;
}

const THRESHOLD_RULES = [
  // ===== CRITICAL — Temperature =====
  { match: /Core.*Temp|Core Temperatures/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 95, severity: 'critical',
    explanation: 'CPU core temperature is dangerously high. Risk of thermal throttling, silicon degradation, and potential thermal shutdown.' },
  { match: /CPU Package/i, unitFilter: '\u00b0C', notMatch: /Power/i,
    type: 'above', threshold: 100, severity: 'critical',
    explanation: 'CPU package temperature at critical level. Immediate cooling intervention needed.' },
  { match: /GPU Temperature/i, unitFilter: '\u00b0C', notMatch: /Hot\s*Spot/i,
    type: 'above', threshold: 90, severity: 'critical',
    explanation: 'GPU temperature critically high. Risk of thermal throttling, driver crashes, and hardware damage.' },
  { match: /GPU Hot\s*Spot/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 95, severity: 'critical',
    explanation: 'GPU hot spot at critical temperature. Localized thermal stress can damage solder joints and cause VRAM errors.' },
  { match: /VRM/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 110, severity: 'critical',
    explanation: 'VRM temperature critically high. Risk of VRM failure, motherboard damage, and system instability.' },
  { match: /Drive.*Temp/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 70, severity: 'critical',
    explanation: 'Drive temperature dangerously high. Risk of data loss and drive failure.' },

  // ===== CRITICAL — Boolean Flags =====
  { match: /Thermal Throttling/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'critical',
    explanation: 'Component is actively thermal throttling. Clock speeds reduced to prevent thermal damage.' },
  { match: /Performance Limit.*Thermal/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'critical',
    explanation: 'Thermal performance limit reached. Clocks reduced to cool down.' },
  { match: /Critical Temperature/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'critical',
    explanation: 'Critical temperature threshold reached. System may shut down to prevent permanent damage.' },
  { match: /Drive Failure/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'critical',
    explanation: 'Drive failure flag is set. Back up data immediately \u2014 the drive may fail at any time.' },

  // ===== WARNING — Temperature =====
  { match: /Core.*Temp|Core Temperatures/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 80, severity: 'warning',
    explanation: 'CPU core temperatures elevated. Prolonged operation at this level increases component wear.' },
  { match: /CPU Package/i, unitFilter: '\u00b0C', notMatch: /Power/i,
    type: 'above', threshold: 85, severity: 'warning',
    explanation: 'CPU package temperature elevated. Check CPU cooler mounting and case airflow.' },
  { match: /GPU Temperature/i, unitFilter: '\u00b0C', notMatch: /Hot\s*Spot/i,
    type: 'above', threshold: 80, severity: 'warning',
    explanation: 'GPU temperature elevated. Ensure GPU fans are functioning and heatsink is clean.' },
  { match: /GPU Hot\s*Spot/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 85, severity: 'warning',
    explanation: 'GPU hot spot temperature elevated. Consider repasting thermal compound or improving airflow.' },
  { match: /VRM/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 90, severity: 'warning',
    explanation: 'VRM temperature elevated. Ensure VRM heatsinks have adequate airflow.' },
  { match: /PCH/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 80, severity: 'warning',
    explanation: 'PCH (chipset) temperature elevated. Check for airflow obstructions near chipset.' },
  { match: /Drive.*Temp/i, unitFilter: '\u00b0C',
    type: 'above', threshold: 55, severity: 'warning',
    explanation: 'Drive temperature above recommended operating range. Ensure drive has adequate cooling.' },

  // ===== WARNING — Below Threshold =====
  { match: /Drive Remaining Life/i, unitFilter: '%',
    type: 'below', threshold: 20, severity: 'warning',
    explanation: 'Drive has consumed over 80% of its write endurance. Back up data and plan replacement.' },
  { match: /Distance to TjMAX/i, unitFilter: '\u00b0C',
    type: 'below', threshold: 10, severity: 'warning',
    explanation: 'CPU within 10\u00b0C of its maximum junction temperature. Very close to thermal limit.' },

  // ===== WARNING — Sustained Power =====
  { match: /CPU Package Power/i, unitFilter: 'W',
    type: 'sustained_above', threshold: 200, sustainedMs: 30000, severity: 'warning',
    explanation: 'CPU drawing sustained high power (>200W for >30s). VRM and cooling under heavy load.' },

  // ===== WARNING — Range =====
  { match: /\+12V/i, unitFilter: 'V',
    type: 'range', low: 11.4, high: 12.6, severity: 'warning',
    explanation: '+12V rail outside \u00b15% tolerance. PSU may be under stress or aging.' },

  // ===== WARNING — Boolean Flags =====
  { match: /Power Limit Exceeded/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'warning',
    explanation: 'Power limit was exceeded. Component reduced clocks due to power delivery constraints.' },

  // ===== INFO =====
  { match: /GPU Performance Limit.*Utilization/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'info',
    explanation: 'GPU is utilization-limited. This is normal idle/light-load behavior \u2014 the GPU is not fully utilized.' },
  { match: /Performance Limit.*Power/i, unitFilter: 'Yes/No', notMatch: /Exceeded/i,
    type: 'flag', flagValue: 'Yes', sustainedMs: 60000, severity: 'info',
    explanation: 'GPU power limit active for an extended period. May be normal for power-limited workloads.' },
  { match: /Drive Remaining Life/i, unitFilter: '%',
    type: 'below', threshold: 50, severity: 'info',
    explanation: 'Drive has consumed over half its rated write endurance. Not urgent, but monitor wear rate.' },
  { match: /Drive Warning/i, unitFilter: 'Yes/No',
    type: 'flag', flagValue: 'Yes', severity: 'info',
    explanation: 'Drive SMART warning flag is set. Run a full drive diagnostic.' },
];

function evaluateAbove(rule, header, values, timestamps, totalElapsed) {
  const nonNull = values.filter(v => v !== null);
  if (nonNull.length === 0) return null;
  const peak = Math.max(...nonNull);
  if (peak <= rule.threshold) return null;

  let timeAbove = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== null && values[i] > rule.threshold) {
      timeAbove += tsDelta(timestamps[i], timestamps[i - 1]);
    }
  }
  timeAbove = Math.max(0, timeAbove);
  const pct = totalElapsed > 0 ? Math.max(0, Math.min(100, (timeAbove / totalElapsed) * 100)).toFixed(1) : '0.0';
  const avg = nonNull.reduce((s, v) => s + v, 0) / nonNull.length;

  return {
    severity: rule.severity,
    sensor: header,
    headline: `Peaked at ${peak} (threshold: ${rule.threshold})`,
    detail: `Exceeded ${rule.threshold} for ${formatDuration(timeAbove)} (${pct}% of session). Peak: ${peak}. Session avg: ${avg.toFixed(1)}.`,
    explanation: rule.explanation,
  };
}

function evaluateBelow(rule, header, values) {
  const nonNull = values.filter(v => v !== null);
  if (nonNull.length === 0) return null;
  const minVal = Math.min(...nonNull);
  if (minVal >= rule.threshold) return null;
  const lastVal = nonNull[nonNull.length - 1];

  return {
    severity: rule.severity,
    sensor: header,
    headline: `At ${lastVal} (threshold: below ${rule.threshold})`,
    detail: `Last value: ${lastVal}. Session minimum: ${minVal}.`,
    explanation: rule.explanation,
  };
}

function evaluateRange(rule, header, values, timestamps, totalElapsed) {
  let outCount = 0;
  let timeOutside = 0;
  let minOut = Infinity;
  let maxOut = -Infinity;

  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && (values[i] < rule.low || values[i] > rule.high)) {
      outCount++;
      if (values[i] < minOut) minOut = values[i];
      if (values[i] > maxOut) maxOut = values[i];
      if (i > 0) timeOutside += tsDelta(timestamps[i], timestamps[i - 1]);
    }
  }
  if (outCount === 0) return null;
  timeOutside = Math.max(0, timeOutside);
  const pct = totalElapsed > 0 ? Math.max(0, Math.min(100, (timeOutside / totalElapsed) * 100)).toFixed(1) : '0.0';

  return {
    severity: rule.severity,
    sensor: header,
    headline: `Outside ${rule.low}\u2013${rule.high} range`,
    detail: `Out of range for ${formatDuration(timeOutside)} (${pct}% of session). Observed: ${minOut.toFixed(2)}\u2013${maxOut.toFixed(2)}.`,
    explanation: rule.explanation,
  };
}

function evaluateFlag(rule, header, rawValues, timestamps, totalElapsed) {
  const flagIndices = [];
  for (let i = 0; i < rawValues.length; i++) {
    if (rawValues[i] === rule.flagValue) flagIndices.push(i);
  }
  if (flagIndices.length === 0) return null;

  let timeActive = 0;
  for (let i = 1; i < rawValues.length; i++) {
    if (rawValues[i] === rule.flagValue) {
      timeActive += tsDelta(timestamps[i], timestamps[i - 1]);
    }
  }
  timeActive = Math.max(0, timeActive);

  if (rule.sustainedMs) {
    let longest = 0;
    let current = 0;
    for (let i = 1; i < rawValues.length; i++) {
      if (rawValues[i] === rule.flagValue) {
        current += tsDelta(timestamps[i], timestamps[i - 1]);
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    }
    if (longest < rule.sustainedMs) return null;
  }

  const pct = totalElapsed > 0 ? Math.max(0, Math.min(100, (timeActive / totalElapsed) * 100)).toFixed(1) : '0.0';

  return {
    severity: rule.severity,
    sensor: header,
    headline: `Active for ${formatDuration(timeActive)} (${pct}% of session)`,
    detail: `${flagIndices.length} samples. First at ${timestamps[flagIndices[0]]?.toLocaleTimeString() || 'unknown'}.`,
    explanation: rule.explanation,
  };
}

function evaluateSustainedAbove(rule, header, values, timestamps, totalElapsed) {
  let longestSustained = 0;
  let currentSustained = 0;
  let longestStart = null;
  let longestEnd = null;
  let currentStart = null;

  for (let i = 1; i < values.length; i++) {
    if (values[i] !== null && values[i] > rule.threshold) {
      if (currentStart === null) currentStart = i;
      currentSustained += tsDelta(timestamps[i], timestamps[i - 1]);
      if (currentSustained > longestSustained) {
        longestSustained = currentSustained;
        longestStart = currentStart;
        longestEnd = i;
      }
    } else {
      currentStart = null;
      currentSustained = 0;
    }
  }
  if (longestSustained < rule.sustainedMs) return null;

  const peak = Math.max(...values.filter(v => v !== null));
  const timeRange = longestStart != null
    ? `${timestamps[longestStart]?.toLocaleTimeString()} \u2013 ${timestamps[longestEnd]?.toLocaleTimeString()}`
    : 'N/A';

  return {
    severity: rule.severity,
    sensor: header,
    headline: `Sustained above ${rule.threshold} for ${formatDuration(longestSustained)}`,
    detail: `Longest period: ${formatDuration(longestSustained)} (${timeRange}). Peak: ${peak}.`,
    explanation: rule.explanation,
  };
}

function evaluateRule(rule, header, numValues, rawValues, timestamps, totalElapsed) {
  switch (rule.type) {
    case 'above': return evaluateAbove(rule, header, numValues, timestamps, totalElapsed);
    case 'below': return evaluateBelow(rule, header, numValues);
    case 'range': return evaluateRange(rule, header, numValues, timestamps, totalElapsed);
    case 'flag': return evaluateFlag(rule, header, rawValues, timestamps, totalElapsed);
    case 'sustained_above': return evaluateSustainedAbove(rule, header, numValues, timestamps, totalElapsed);
    default: return null;
  }
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

function deduplicateAlerts(alerts) {
  const bySensor = {};
  for (const alert of alerts) {
    if (!bySensor[alert.sensor]) bySensor[alert.sensor] = [];
    bySensor[alert.sensor].push(alert);
  }
  const result = [];
  for (const sensorAlerts of Object.values(bySensor)) {
    sensorAlerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    result.push(sensorAlerts[0]);
  }
  result.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return result;
}

export function evaluateAlerts(headers, rows) {
  if (rows.length < 2) return [];

  const timestamps = rows.map(r => parseHWiNFODate(r.Date, r.Time));
  const validTs = timestamps.filter(t => t != null);
  if (validTs.length < 2) return [];
  const totalElapsed = validTs[validTs.length - 1] - validTs[0];
  if (totalElapsed <= 0) return [];

  const alerts = [];
  for (const header of headers) {
    if (header === 'Date' || header === 'Time') continue;
    if (isExcluded(header)) continue;

    const matchingRules = THRESHOLD_RULES.filter(rule => ruleMatchesHeader(rule, header));
    if (matchingRules.length === 0) continue;

    const unit = extractUnitFromHeader(header);
    const numValues = rows.map(r => applySaneBounds(parseNumericValue(r[header]), unit));
    const rawValues = rows.map(r => r[header]);

    for (const rule of matchingRules) {
      const alert = evaluateRule(rule, header, numValues, rawValues, timestamps, totalElapsed);
      if (alert) alerts.push(alert);
    }
  }

  return deduplicateAlerts(alerts);
}
