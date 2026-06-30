import { useMemo } from 'react';
import { parseHWiNFODate } from '../utils/csvParser';
import { parseNumericValue } from '../utils/sanitize';
import { computeStats, extractUnit, getSessionInfo } from '../utils/briefing';

const COMPARE_SENSORS = [
  { pattern: /CPU Package.*\[\u00b0C\]/i, label: 'CPU Temp', lowerIsBetter: true },
  { pattern: /GPU Temperature.*\[\u00b0C\]/i, label: 'GPU Temp', lowerIsBetter: true },
  { pattern: /CPU Package Power.*\[W\]/i, label: 'CPU Power', lowerIsBetter: true },
  { pattern: /GPU Power.*\[W\]/i, label: 'GPU Power', lowerIsBetter: true },
  { pattern: /Total CPU Usage.*\[%\]/i, label: 'CPU Usage', lowerIsBetter: false },
  { pattern: /GPU Core Load.*\[%\]/i, label: 'GPU Load', lowerIsBetter: false },
];

export default function ComparisonSummary({ sessions, parsedData, comparisonData, comparisonFilename, onRemove }) {
  const summary = useMemo(() => {
    if (!comparisonData || sessions.length === 0) return null;

    const primarySession = sessions[0];
    const primaryData = parsedData[primarySession.key];
    if (!primaryData) return null;

    const primaryInfo = getSessionInfo(primaryData.rows);
    const compInfo = getSessionInfo(comparisonData.rows);

    const comparisons = [];
    for (const { pattern, label, lowerIsBetter } of COMPARE_SENSORS) {
      const primaryHeader = primaryData.headers.find(h => pattern.test(h));
      const compHeader = comparisonData.headers.find(h => pattern.test(h));
      if (!primaryHeader || !compHeader) continue;

      const primaryVals = primaryData.rows.map(r => parseNumericValue(r[primaryHeader]));
      const compVals = comparisonData.rows.map(r => parseNumericValue(r[compHeader]));

      const pStats = computeStats(primaryVals);
      const cStats = computeStats(compVals);
      if (pStats.avg === null || cStats.avg === null) continue;

      const diff = pStats.avg - cStats.avg;
      const unit = extractUnit(primaryHeader);
      const isBetter = lowerIsBetter ? diff < 0 : diff > 0;

      comparisons.push({
        label,
        primaryAvg: pStats.avg,
        compAvg: cStats.avg,
        diff: Math.abs(diff).toFixed(1),
        unit,
        direction: diff < 0 ? 'down' : 'up',
        isBetter,
      });
    }

    return { primaryInfo, compInfo, comparisons, primaryFilename: primarySession.filename };
  }, [sessions, parsedData, comparisonData]);

  if (!summary) return null;

  const formatDate = (info) => {
    if (!info) return 'Unknown';
    return `${info.firstTimestamp.toLocaleDateString()} ${info.firstTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\u2013${info.lastTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${info.duration})`;
  };

  return (
    <div className="p-3 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-blue-600 dark:text-blue-400">SESSION COMPARISON</h2>
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-xs">x</button>
      </div>
      <div className="text-[10px] text-gray-400 space-y-0.5 mb-2">
        <div>Primary: {formatDate(summary.primaryInfo)}</div>
        <div>Compare: {formatDate(summary.compInfo)}</div>
      </div>
      <div className="space-y-1">
        {summary.comparisons.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-[10px]">
            <span className="text-gray-300">{c.label}:</span>
            <span>
              <span className="text-gray-400">Avg {c.primaryAvg}{c.unit} vs {c.compAvg}{c.unit}</span>
              {' '}
              <span className={c.isBetter ? 'text-green-400' : 'text-red-400'}>
                ({c.direction === 'down' ? '\u2193' : '\u2191'} {c.diff}{c.unit})
              </span>
            </span>
          </div>
        ))}
        {summary.comparisons.length === 0 && (
          <div className="text-[10px] text-gray-500">No comparable sensors found</div>
        )}
      </div>
    </div>
  );
}
