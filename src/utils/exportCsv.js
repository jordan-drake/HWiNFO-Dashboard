function esc(str) {
  if (str === undefined || str === null) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildBriefingCSV({ sessionInfos, statsTable, throttlingData, driveHealth, observations }) {
  const lines = [];
  lines.push('Section,Metric,Session,Value,Unit');

  // Session Info
  for (const { session, info } of sessionInfos) {
    if (!info) continue;
    lines.push(`Session Info,Filename,${esc(session.filename)},${esc(session.filename)},`);
    lines.push(`Session Info,Upload Date,${esc(session.filename)},${esc(new Date(session.uploadTimestamp).toLocaleString())},`);
    lines.push(`Session Info,First Timestamp,${esc(session.filename)},${esc(info.firstTimestamp.toLocaleString())},`);
    lines.push(`Session Info,Last Timestamp,${esc(session.filename)},${esc(info.lastTimestamp.toLocaleString())},`);
    lines.push(`Session Info,Duration,${esc(session.filename)},${esc(info.duration)},`);
  }

  // Stats
  for (const row of statsTable) {
    lines.push(`Stats,${esc(row.sensor)} - Min,${esc(row.session)},${row.min ?? ''},${esc(row.unit)}`);
    lines.push(`Stats,${esc(row.sensor)} - Max,${esc(row.session)},${row.max ?? ''},${esc(row.unit)}`);
    lines.push(`Stats,${esc(row.sensor)} - Average,${esc(row.session)},${row.avg ?? ''},${esc(row.unit)}`);
  }

  // Throttling
  if (throttlingData.length === 0) {
    lines.push('Throttling,Status,,No throttling detected,');
  } else {
    for (const td of throttlingData) {
      for (const ev of td.events) {
        lines.push(`Throttling,${esc(td.column)},${esc(td.session)},${esc(ev.timestamp?.toLocaleString() || '')} - ${ev.sustained ? 'sustained' : 'spike'},`);
      }
    }
  }

  // Drive Health
  if (driveHealth.length === 0) {
    lines.push('Drive Health,Status,,No drive sensors detected,');
  } else {
    for (const d of driveHealth) {
      lines.push(`Drive Health,${esc(d.header)},${esc(d.session)},${d.value ?? 'N/A'},${esc(d.unit)}`);
    }
  }

  // Observations
  if (observations.length === 0) {
    lines.push('Observations,Status,,No notable observations,');
  } else {
    for (const obs of observations) {
      lines.push(`Observations,[${obs.severity}] ${esc(obs.sensor)},${esc(obs.session || '')},${esc(obs.headline)},`);
      if (obs.detail) {
        lines.push(`Observations,Detail,${esc(obs.session || '')},${esc(obs.detail)},`);
      }
      if (obs.impact) {
        lines.push(`Observations,Impact,${esc(obs.session || '')},${esc(obs.impact)},`);
      }
      if (obs.recommendation) {
        lines.push(`Observations,Recommendation,${esc(obs.session || '')},${esc(obs.recommendation)},`);
      }
    }
  }

  return lines.join('\n');
}

export function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
