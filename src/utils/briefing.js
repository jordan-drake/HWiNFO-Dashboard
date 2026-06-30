import { parseHWiNFODate } from './csvParser';
import { parseNumericValue } from './sanitize';

export function computeStats(values) {
  const nums = values.filter(v => v !== null);
  if (nums.length === 0) return { min: null, max: null, avg: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
  return { min, max, avg: parseFloat(avg.toFixed(2)) };
}

export function extractUnit(header) {
  const match = header.match(/\[([^\]]+)\]/);
  return match ? match[1] : '';
}

const THROTTLE_PATTERNS = [
  /thermal throttling/i,
  /power limit exceeded/i,
  /performance limit - power/i,
  /performance limit - thermal/i,
  /critical temperature/i,
];

export function isThrottleColumn(header) {
  return THROTTLE_PATTERNS.some(p => p.test(header));
}

export function detectThrottlingEvents(values, timestamps = null) {
  const events = [];
  for (let i = 0; i < values.length; i++) {
    const cur = values[i];
    const prev = i > 0 ? values[i - 1] : 'No';
    if (cur === 'Yes' && prev !== 'Yes') {
      let count = 0;
      let j = i;
      while (j < values.length && values[j] === 'Yes') {
        count++;
        j++;
      }
      const endIndex = j - 1;
      const event = { index: i, sustained: count > 1, consecutiveCount: count, endIndex };
      if (timestamps) {
        event.startTime = timestamps[i];
        event.endTime = timestamps[endIndex];
        event.durationMs = timestamps[endIndex] - timestamps[i];
      }
      events.push(event);
    }
  }
  return events;
}

export function getSessionInfo(rows) {
  if (rows.length === 0) return null;
  const first = parseHWiNFODate(rows[0].Date, rows[0].Time);
  const last = parseHWiNFODate(rows[rows.length - 1].Date, rows[rows.length - 1].Time);
  if (!first || !last) return null;
  const durationMs = last - first;
  const totalSec = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    firstTimestamp: first,
    lastTimestamp: last,
    duration: `${hours}h ${minutes}m ${seconds}s`,
    durationMs,
  };
}

export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
}

function getTempImpact(sensor) {
  return {
    impact: 'Prolonged operation near thermal limits accelerates electromigration \u2014 the gradual displacement of metal atoms in the processor\u2019s interconnects \u2014 which permanently degrades the chip over time. Sustained heat also stresses VRM power delivery and surrounding capacitors on the motherboard, shortening their lifespan. If the system is thermally throttling during these periods, you are also losing performance.',
    recommendation: 'Verify that the cooler is properly mounted with adequate thermal paste. Clean heatsink fins and fans of dust buildup. Ensure the case has good airflow with intake and exhaust fans. Consider upgrading to a higher-capacity cooler if temperatures remain high under normal workloads.',
  };
}

function getPowerImpact() {
  return {
    impact: 'Sustained high power draw stresses the voltage regulator module (VRM) and capacitors on the motherboard or GPU PCB. Excessive VRM temperatures can cause capacitor degradation, component instability, and in extreme cases, permanent failure. The PSU is also working harder, which reduces its lifespan and efficiency.',
    recommendation: 'Ensure adequate VRM cooling with heatsinks and airflow. Check that the PSU has sufficient wattage headroom (ideally 20\u201330% above peak system draw). Avoid aggressive overclocking if VRM temperatures are already elevated.',
  };
}

function getUsageImpact() {
  return {
    impact: 'The component is operating near full utilization for a significant portion of the session. This leaves little headroom for burst loads, which can cause stuttering, frame drops, or application lag. Sustained full load also increases heat and power consumption throughout the system.',
    recommendation: 'Consider whether the workload can be optimized or distributed. Close unnecessary background applications. For GPUs, lowering resolution or graphics settings reduces utilization. For persistent high load during normal use, consider a hardware upgrade.',
  };
}

function getGenericImpact(sensor) {
  return {
    impact: 'This sensor spent a significant portion of the session operating near its observed peak value, indicating sustained heavy load on the component. Prolonged heavy load increases wear on all related components.',
    recommendation: 'Monitor this sensor alongside temperature readings to ensure the workload is not causing thermal issues. If performance is acceptable and temperatures are within limits, this may be expected behavior for your workload.',
  };
}

export function getDetailedObservations(rows, selectedSensors, headers) {
  const observations = [];
  if (rows.length < 2) return observations;

  const timestamps = rows.map(r => parseHWiNFODate(r.Date, r.Time));
  const validTs = timestamps.filter(t => t != null);
  if (validTs.length < 2) return observations;
  const totalElapsed = validTs[validTs.length - 1] - validTs[0];
  if (totalElapsed <= 0) return observations;

  for (const sensor of selectedSensors) {
    const values = rows.map(r => parseNumericValue(r[sensor]));
    const nums = values.filter(v => v !== null);
    if (nums.length === 0) continue;

    const maxVal = Math.max(...nums);
    const threshold90 = maxVal * 0.9;
    const unit = extractUnit(sensor);

    // 1. Sensor near peak for extended period
    let timeAbove90 = 0;
    let longestPeriodDuration = 0;
    let longestPeriodStart = null;
    let longestPeriodEnd = null;
    let currentPeriodStart = null;
    let currentPeriodDuration = 0;
    let sumDuringHigh = 0;
    let countDuringHigh = 0;

    for (let i = 1; i < rows.length; i++) {
      if (values[i] !== null && values[i] >= threshold90) {
        const dt = (timestamps[i] != null && timestamps[i - 1] != null) ? Math.max(0, timestamps[i] - timestamps[i - 1]) : 0;
        timeAbove90 += dt;
        sumDuringHigh += values[i];
        countDuringHigh++;
        if (currentPeriodStart === null) {
          currentPeriodStart = i - 1;
          currentPeriodDuration = 0;
        }
        currentPeriodDuration += dt;
        if (currentPeriodDuration > longestPeriodDuration) {
          longestPeriodDuration = currentPeriodDuration;
          longestPeriodStart = currentPeriodStart;
          longestPeriodEnd = i;
        }
      } else {
        currentPeriodStart = null;
        currentPeriodDuration = 0;
      }
    }

    if (timeAbove90 > totalElapsed * 0.1) {
      const pct = ((timeAbove90 / totalElapsed) * 100).toFixed(1);
      const avgDuringHigh = countDuringHigh > 0 ? (sumDuringHigh / countDuringHigh).toFixed(1) : 'N/A';

      let impactInfo;
      if (sensor.includes('\u00b0C')) impactInfo = getTempImpact(sensor);
      else if (sensor.includes('[W]')) impactInfo = getPowerImpact();
      else if (sensor.includes('[%]')) impactInfo = getUsageImpact();
      else impactInfo = getGenericImpact(sensor);

      const longestStr = longestPeriodStart !== null
        ? ` Longest continuous stretch: ${formatDuration(longestPeriodDuration)} (${timestamps[longestPeriodStart].toLocaleTimeString()} \u2013 ${timestamps[longestPeriodEnd].toLocaleTimeString()}).`
        : '';

      observations.push({
        severity: 'warning',
        sensor,
        headline: `${sensor} near peak for ${formatDuration(timeAbove90)} (${pct}% of session)`,
        detail: `Operated at or above ${threshold90.toFixed(1)}${unit} (90% of observed peak ${maxVal}${unit}) for ${formatDuration(timeAbove90)} out of ${formatDuration(totalElapsed)} total session time. Average during high-load periods: ${avgDuringHigh}${unit}.${longestStr}`,
        ...impactInfo,
      });
    }

    // 2. CPU Package > 80\u00b0C sustained > 60s
    if (sensor.includes('CPU Package') && sensor.includes('\u00b0C')) {
      let sustained = 0;
      let maxSustained = 0;
      let maxSustainedStart = null;
      let maxSustainedEnd = null;
      let currentStart = null;
      let peakOverall = 0;
      let sumOverall = 0;
      let countOverall = 0;
      let totalTimeAbove80 = 0;

      for (let i = 1; i < rows.length; i++) {
        if (values[i] !== null && values[i] > 80) {
          const dt = (timestamps[i] != null && timestamps[i - 1] != null) ? Math.max(0, timestamps[i] - timestamps[i - 1]) : 0;
          if (currentStart === null) currentStart = i;
          sustained += dt;
          totalTimeAbove80 += dt;
          sumOverall += values[i];
          countOverall++;
          if (values[i] > peakOverall) peakOverall = values[i];
          if (sustained > maxSustained) {
            maxSustained = sustained;
            maxSustainedStart = currentStart;
            maxSustainedEnd = i;
          }
        } else {
          currentStart = null;
          sustained = 0;
        }
      }

      if (maxSustained > 60000) {
        const avgDuring = countOverall > 0 ? (sumOverall / countOverall).toFixed(1) : 'N/A';
        const pct = ((totalTimeAbove80 / totalElapsed) * 100).toFixed(1);
        const timeRange = maxSustainedStart !== null
          ? `${timestamps[maxSustainedStart].toLocaleTimeString()} to ${timestamps[maxSustainedEnd].toLocaleTimeString()}`
          : 'N/A';

        observations.push({
          severity: 'critical',
          sensor,
          headline: `CPU Package exceeded 80\u00b0C for ${formatDuration(maxSustained)} sustained (${pct}% of session above 80\u00b0C)`,
          detail: `Longest sustained period above 80\u00b0C: ${formatDuration(maxSustained)} (${timeRange}). Peak temperature: ${peakOverall}\u00b0C. Average when above 80\u00b0C: ${avgDuring}\u00b0C. Total time above 80\u00b0C: ${formatDuration(totalTimeAbove80)}.`,
          impact: 'Sustained CPU temperatures above 80\u00b0C accelerate electromigration \u2014 the gradual displacement of metal atoms in the processor\u2019s interconnects \u2014 which permanently degrades the chip over time. At these temperatures, the CPU is likely thermal throttling (automatically reducing clock speeds), directly reducing performance. The motherboard VRM components near the CPU socket are also subjected to elevated heat, shortening their lifespan and potentially causing voltage instability under load.',
          recommendation: 'Check that the CPU cooler is properly seated with adequate, evenly-spread thermal paste. Ensure case fans provide sufficient airflow (front intake, rear/top exhaust). If the cooler is more than 2 years old, reapply thermal paste. For high-ambient-temperature environments, upgrade to a tower cooler or AIO liquid cooling solution. Monitor VRM temperatures as well.',
        });
      }
    }

    // 3. GPU Hot Spot > 90\u00b0C
    if (sensor.includes('GPU Hot Spot') && sensor.includes('\u00b0C')) {
      const hotSpotRows = [];
      let maxHotSpot = 0;
      let timeAbove = 0;

      for (let i = 0; i < values.length; i++) {
        if (values[i] !== null && values[i] > 90) {
          hotSpotRows.push({ index: i, value: values[i], timestamp: timestamps[i] });
          if (values[i] > maxHotSpot) maxHotSpot = values[i];
          if (i > 0 && timestamps[i] != null && timestamps[i - 1] != null) timeAbove += Math.max(0, timestamps[i] - timestamps[i - 1]);
        }
      }

      if (hotSpotRows.length > 0) {
        const pct = ((timeAbove / totalElapsed) * 100).toFixed(1);
        observations.push({
          severity: 'critical',
          sensor,
          headline: `GPU Hot Spot exceeded 90\u00b0C \u2014 peak ${maxHotSpot}\u00b0C, ${hotSpotRows.length} samples (${formatDuration(timeAbove)}, ${pct}% of session)`,
          detail: `First occurrence at ${hotSpotRows[0].timestamp.toLocaleTimeString()} (${hotSpotRows[0].value}\u00b0C). Peak: ${maxHotSpot}\u00b0C. Total time above 90\u00b0C: ${formatDuration(timeAbove)} across ${hotSpotRows.length} readings.`,
          impact: 'GPU hot spot temperatures above 90\u00b0C indicate severe localized thermal stress on the GPU die. Hot spots cause differential thermal expansion that stresses solder joints \u2014 a leading cause of GPU failure. At these temperatures, VRAM errors can produce visual artifacts (flickering, texture corruption), and the GPU driver may crash (black screen / TDR timeout events). The GPU will thermally throttle, significantly reducing gaming and rendering performance.',
          recommendation: 'Ensure all GPU fans are spinning and heatsink fins are free of dust. If the card is over 2 years old, consider replacing thermal pads and paste (especially between the die and heatsink). Ensure the PC case has adequate airflow around the GPU slot. GPU undervolting (reducing voltage at the same clock speed) can dramatically reduce hot spot temperatures with minimal performance impact \u2014 tools like MSI Afterburner make this straightforward.',
        });
      }
    }
  }

  // 4. Throttling events from all headers
  for (const header of headers) {
    if (!isThrottleColumn(header)) continue;
    const vals = rows.map(r => r[header]);
    const events = detectThrottlingEvents(vals, timestamps);
    if (events.length === 0) continue;

    let totalThrottleTime = 0;
    for (let i = 1; i < rows.length; i++) {
      if (vals[i] === 'Yes' && timestamps[i] != null && timestamps[i - 1] != null) {
        totalThrottleTime += Math.max(0, timestamps[i] - timestamps[i - 1]);
      }
    }
    const throttlePct = ((totalThrottleTime / totalElapsed) * 100).toFixed(1);

    let throttleType, impact, recommendation;
    if (/power/i.test(header)) {
      throttleType = 'Power Limit';
      impact = `The component exceeded its configured power delivery limit (TDP) and was forced to reduce clock speeds. Each throttle event represents a period of reduced performance. Across ${events.length} event(s), the component spent ${formatDuration(totalThrottleTime)} in a throttled state (${throttlePct}% of session). Frequent power limit throttling means the workload consistently demands more power than the current TDP setting permits. While not directly harmful to hardware, it caps the performance you\u2019re getting from the component.`;
      recommendation = 'In BIOS, increase PL1/PL2 (power limit) values if your cooling solution can handle the extra heat. For GPUs, use MSI Afterburner or similar to raise the power limit slider. Ensure your PSU has adequate wattage (peak system draw + 20\u201330% headroom). If you cannot increase power limits, this throttling is expected and simply means the workload exceeds the configured power envelope.';
    } else if (/thermal/i.test(header)) {
      throttleType = 'Thermal';
      impact = `The component reached its thermal safety limit and automatically reduced clock speeds to prevent damage. This occurred ${events.length} time(s) totaling ${formatDuration(totalThrottleTime)} of throttled operation (${throttlePct}% of session). Unlike power limit throttling, thermal throttling indicates a physical cooling problem that can worsen over time as thermal paste degrades or dust accumulates. Every second of thermal throttling is a second of reduced performance AND accelerated component wear.`;
      recommendation = 'Address cooling before anything else: clean dust from heatsinks and fans, reapply thermal paste, ensure case airflow is adequate (cool air intake at front/bottom, hot air exhaust at rear/top). If throttling persists after cleaning, upgrade the cooler. Do NOT increase power limits while thermal throttling is occurring \u2014 this will make the problem worse.';
    } else {
      throttleType = 'Critical';
      impact = `A critical thermal or power condition was detected, causing the system to throttle for protection. This is more severe than standard throttling and indicates the component was operating outside its safe operating envelope for ${formatDuration(totalThrottleTime)} (${throttlePct}% of session).`;
      recommendation = 'Investigate cooling immediately. Check for failed fans, blocked vents, or improper cooler mounting. This level of throttling may indicate hardware issues that can lead to component failure if left unaddressed.';
    }

    observations.push({
      severity: 'critical',
      sensor: header,
      headline: `${throttleType} throttling: ${events.length} event(s), ${formatDuration(totalThrottleTime)} total (${throttlePct}% of session)`,
      detail: `First event at ${events[0].startTime?.toLocaleTimeString() || 'unknown'}. ${events.filter(e => e.sustained).length} sustained events, ${events.filter(e => !e.sustained).length} single-sample spikes. Longest single event: ${formatDuration(Math.max(...events.map(e => e.durationMs || 0)))}.`,
      impact,
      recommendation,
    });
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  observations.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

  return observations;
}

// Keep backward-compatible alias
export const getNotableObservations = getDetailedObservations;
