import { useState, useMemo, useCallback } from 'react';
import { downloadCSV } from '../utils/exportCsv';

function AlertCard({ alert }) {
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

  const style = severityStyles[alert.severity] || severityStyles.info;

  return (
    <div className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg p-3 mb-2`}>
      <div className="flex items-start gap-2">
        <span className={`${style.badge} text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{alert.sensor}</div>
          <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">{alert.headline}</div>
          {alert.session && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{alert.session}</div>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 text-[10px]">
          {alert.detail && (
            <div className="text-gray-600 dark:text-gray-400">{alert.detail}</div>
          )}
          {alert.explanation && (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300">Why This Matters</div>
              <div className="text-gray-600 dark:text-gray-400">{alert.explanation}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AlertPanel({ alerts, hasData }) {
  const grouped = useMemo(() => ({
    critical: alerts.filter(a => a.severity === 'critical'),
    warning: alerts.filter(a => a.severity === 'warning'),
    info: alerts.filter(a => a.severity === 'info'),
  }), [alerts]);

  const hasIssues = grouped.critical.length > 0 || grouped.warning.length > 0;

  const handleExport = useCallback(() => {
    if (alerts.length === 0) return;
    const lines = ['Severity,Sensor,Session,Headline,Detail,Explanation'];
    for (const a of alerts) {
      const esc = (s) => {
        if (!s) return '';
        const str = String(s);
        if (str.includes(',') || str.includes('"') || str.includes('\n'))
          return `"${str.replace(/"/g, '""')}"`;
        return str;
      };
      lines.push(`${a.severity},${esc(a.sensor)},${esc(a.session || '')},${esc(a.headline)},${esc(a.detail)},${esc(a.explanation)}`);
    }
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    downloadCSV(lines.join('\n'), `hwinfo-alerts-${timestamp}.csv`);
  }, [alerts]);

  if (!hasData) {
    return (
      <div className="p-4 flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        Load a session to see alerts
      </div>
    );
  }

  return (
    <div className="p-3 text-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-blue-600 dark:text-blue-400">ALERTS</h2>
        {alerts.length > 0 && (
          <button
            onClick={handleExport}
            className="text-[10px] px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
          >
            Export CSV
          </button>
        )}
      </div>

      {!hasIssues && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg p-3 mb-3 text-center">
          <div className="text-green-700 dark:text-green-400 font-semibold text-sm">All Clear</div>
          <div className="text-green-600 dark:text-green-500 text-xs mt-0.5">
            No critical or warning alerts detected
          </div>
        </div>
      )}

      {grouped.critical.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1 uppercase">
            Critical ({grouped.critical.length})
          </div>
          {grouped.critical.map((a, i) => <AlertCard key={`c-${i}`} alert={a} />)}
        </div>
      )}

      {grouped.warning.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 uppercase">
            Warning ({grouped.warning.length})
          </div>
          {grouped.warning.map((a, i) => <AlertCard key={`w-${i}`} alert={a} />)}
        </div>
      )}

      {grouped.info.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1 uppercase">
            Info ({grouped.info.length})
          </div>
          {grouped.info.map((a, i) => <AlertCard key={`i-${i}`} alert={a} />)}
        </div>
      )}

      {alerts.length === 0 && (
        <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-4">
          No alerts for this session
        </div>
      )}
    </div>
  );
}
