import { useMemo, useState, useCallback } from 'react';
import { parseHWiNFODate } from '../utils/csvParser';
import { parseNumericValue } from '../utils/sanitize';
import {
  computeStats,
  extractUnit,
  getSessionInfo,
  isThrottleColumn,
  detectThrottlingEvents,
  getDetailedObservations,
  formatDuration,
} from '../utils/briefing';
import { buildBriefingCSV, downloadCSV } from '../utils/exportCsv';

function ObservationCard({ obs }) {
  const [expanded, setExpanded] = useState(false);

  const severityStyles = {
    critical: {
      border: 'border-red-400 dark:border-red-500',
      bg: 'bg-red-50 dark:bg-red-950/30',
      badge: 'bg-red-600 text-white',
      label: 'CRITICAL',
    },
    warning: {
      border: 'border-amber-400 dark:border-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      badge: 'bg-amber-600 text-white',
      label: 'WARNING',
    },
    info: {
      border: 'border-blue-400 dark:border-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      badge: 'bg-blue-600 text-white',
      label: 'INFO',
    },
  };

  const style = severityStyles[obs.severity] || severityStyles.warning;

  return (
    <div className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg p-3 mb-2`}>
      <div className="flex items-start gap-2">
        <span className={`${style.badge} text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{obs.headline}</div>
          {obs.session && (
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{obs.session}</div>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
        >
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          {obs.detail && (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">Measurements</div>
              <div className="text-gray-600 dark:text-gray-400">{obs.detail}</div>
            </div>
          )}
          {obs.impact && (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">Why This Matters</div>
              <div className="text-gray-600 dark:text-gray-400">{obs.impact}</div>
            </div>
          )}
          {obs.recommendation && (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-0.5">Recommendation</div>
              <div className="text-gray-600 dark:text-gray-400">{obs.recommendation}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BriefingPanel({ sessions, parsedData, selectedSensors }) {
  const hasActive = sessions.length > 0;
  const hasSensors = selectedSensors.length > 0;

  const sessionInfos = useMemo(() => {
    return sessions.map(s => {
      const data = parsedData[s.key];
      if (!data) return { session: s, info: null };
      return { session: s, info: getSessionInfo(data.rows) };
    });
  }, [sessions, parsedData]);

  const statsTable = useMemo(() => {
    const rows = [];
    for (const sensor of selectedSensors) {
      for (const s of sessions) {
        const data = parsedData[s.key];
        if (!data || !data.headers.includes(sensor)) continue;
        const values = data.rows.map(r => parseNumericValue(r[sensor]));
        const stats = computeStats(values);
        rows.push({
          sensor,
          session: s.filename,
          ...stats,
          unit: extractUnit(sensor),
        });
      }
    }
    return rows;
  }, [sessions, parsedData, selectedSensors]);

  const throttlingData = useMemo(() => {
    const results = [];
    for (const s of sessions) {
      const data = parsedData[s.key];
      if (!data) continue;
      const timestamps = data.rows.map(r => parseHWiNFODate(r.Date, r.Time));
      const validTs = timestamps.filter(t => t != null);
      const totalElapsed = validTs.length >= 2 ? validTs[validTs.length - 1] - validTs[0] : 0;
      for (const header of data.headers) {
        if (!isThrottleColumn(header)) continue;
        const values = data.rows.map(r => r[header]);
        const events = detectThrottlingEvents(values, timestamps);
        if (events.length > 0) {
          let totalThrottleTime = 0;
          for (let i = 1; i < data.rows.length; i++) {
            if (values[i] === 'Yes' && timestamps[i] != null && timestamps[i - 1] != null) {
              totalThrottleTime += Math.max(0, timestamps[i] - timestamps[i - 1]);
            }
          }
          results.push({
            session: s.filename,
            column: header,
            events: events.map(ev => ({
              ...ev,
              timestamp: parseHWiNFODate(data.rows[ev.index].Date, data.rows[ev.index].Time),
            })),
            totalThrottleTime,
            totalElapsed,
          });
        }
      }
    }
    return results;
  }, [sessions, parsedData]);

  const driveHealth = useMemo(() => {
    const items = [];
    for (const s of sessions) {
      const data = parsedData[s.key];
      if (!data || data.rows.length === 0) continue;
      const lastRow = data.rows[data.rows.length - 1];
      for (const header of data.headers) {
        const hl = header.toLowerCase();
        if (hl.includes('drive remaining life') || hl.includes('drive available spare') || hl.includes('drive temperature')) {
          const val = parseNumericValue(lastRow[header]);
          items.push({ session: s.filename, header, value: val, unit: extractUnit(header) });
        }
      }
    }
    return items;
  }, [sessions, parsedData]);

  const observations = useMemo(() => {
    const obs = [];
    for (const s of sessions) {
      const data = parsedData[s.key];
      if (!data) continue;
      const sessionObs = getDetailedObservations(data.rows, selectedSensors, data.headers);
      obs.push(...sessionObs.map(o => ({ ...o, session: s.filename })));
    }
    return obs;
  }, [sessions, parsedData, selectedSensors]);

  const handleExportCSV = useCallback(() => {
    const csv = buildBriefingCSV({
      sessionInfos,
      statsTable,
      throttlingData,
      driveHealth,
      observations,
    });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    downloadCSV(csv, `hwinfo-briefing-${timestamp}.csv`);
  }, [sessionInfos, statsTable, throttlingData, driveHealth, observations]);

  if (!hasActive || !hasSensors) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-4 h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        {!hasActive ? 'Activate a session to see the briefing' : 'Select sensors to generate the briefing'}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-4 text-sm space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCSV}
          className="text-xs px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white font-medium"
        >
          Export Briefing CSV
        </button>
      </div>

      {/* SESSION INFO */}
      <section>
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">SESSION INFO</h3>
        {sessionInfos.map(({ session, info }) => (
          <div key={session.key} className="mb-2">
            <div className="font-medium">{session.filename}</div>
            {info && (
              <div className="text-gray-500 dark:text-gray-400 text-xs">
                <div>Uploaded: {new Date(session.uploadTimestamp).toLocaleString()}</div>
                <div>First: {info.firstTimestamp.toLocaleString()}</div>
                <div>Last: {info.lastTimestamp.toLocaleString()}</div>
                <div>Duration: {info.duration}</div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* PEAK / MIN / AVG TABLE */}
      <section>
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">PEAK / MIN / AVG TABLE</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                <th className="text-left py-1 pr-2">Sensor</th>
                <th className="text-left py-1 pr-2">Session</th>
                <th className="text-right py-1 pr-2">Min</th>
                <th className="text-right py-1 pr-2">Max</th>
                <th className="text-right py-1 pr-2">Average</th>
                <th className="text-left py-1">Unit</th>
              </tr>
            </thead>
            <tbody>
              {statsTable.map((row, i) => (
                <tr key={i} className="border-b border-gray-200 dark:border-gray-700/50">
                  <td className="py-1 pr-2">{row.sensor}</td>
                  <td className="py-1 pr-2 text-gray-500 dark:text-gray-400">{row.session}</td>
                  <td className="text-right py-1 pr-2">{row.min !== null ? row.min : '-'}</td>
                  <td className="text-right py-1 pr-2">{row.max !== null ? row.max : '-'}</td>
                  <td className="text-right py-1 pr-2">{row.avg !== null ? row.avg : '-'}</td>
                  <td className="py-1">{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* THROTTLING EVENTS */}
      <section>
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">THROTTLING EVENTS</h3>
        {throttlingData.length === 0 ? (
          <p className="text-green-600 dark:text-green-400">No throttling detected</p>
        ) : (
          throttlingData.map((td, i) => {
            const throttlePct = td.totalElapsed > 0
              ? ((td.totalThrottleTime / td.totalElapsed) * 100).toFixed(1)
              : '0.0';
            return (
              <div key={i} className="mb-3 bg-white dark:bg-gray-800/50 rounded p-2">
                <div className="font-medium">{td.column} <span className="text-gray-500 dark:text-gray-400">({td.session})</span></div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {td.events.length} transition(s) — Total throttled time: {formatDuration(td.totalThrottleTime)} ({throttlePct}% of session)
                </div>
                {td.events.map((ev, j) => (
                  <div key={j} className="text-xs pl-2 text-gray-700 dark:text-gray-300 mt-0.5">
                    - {ev.timestamp?.toLocaleString()} — {ev.sustained
                      ? `sustained for ${ev.durationMs != null ? formatDuration(ev.durationMs) : `${ev.consecutiveCount} rows`} (${ev.consecutiveCount} consecutive samples)`
                      : 'single-sample spike (<1 polling interval)'}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </section>

      {/* DRIVE HEALTH SNAPSHOT */}
      <section>
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">DRIVE HEALTH SNAPSHOT</h3>
        {driveHealth.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No drive sensors detected in this dataset</p>
        ) : (
          <div className="space-y-1">
            {driveHealth.map((d, i) => {
              let colorClass = 'text-gray-900 dark:text-gray-100';
              if (d.header.toLowerCase().includes('drive remaining life') && d.value !== null) {
                if (d.value < 20) colorClass = 'text-red-600 dark:text-red-400 font-bold';
                else if (d.value <= 50) colorClass = 'text-yellow-600 dark:text-yellow-400';
              }
              return (
                <div key={i} className="text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{d.session}: </span>
                  <span>{d.header}: </span>
                  <span className={colorClass}>{d.value !== null ? `${d.value} ${d.unit}` : 'N/A'}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* NOTABLE OBSERVATIONS — Enhanced */}
      <section>
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">NOTABLE OBSERVATIONS</h3>
        {observations.length === 0 ? (
          <p className="text-green-600 dark:text-green-400">No notable observations</p>
        ) : (
          <div>
            {observations.map((obs, i) => (
              <ObservationCard key={i} obs={obs} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
