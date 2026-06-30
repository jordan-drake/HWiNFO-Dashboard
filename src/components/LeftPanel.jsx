import { useState, useMemo, useRef, useEffect } from 'react';
import { parseNumericValue } from '../utils/sanitize';
import { computeStats, extractUnit, getSessionInfo } from '../utils/briefing';

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800/50"
      >
        <span>{title}</span>
        <span className="text-gray-400">{open ? '\u2212' : '+'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

const CATEGORY_ORDER = ['thermal', 'power', 'usage', 'fan', 'clock', 'throughput', 'other'];

function CategoryToggleAll({ sensors, enabledSensors, onToggle }) {
  const ref = useRef(null);
  const allChecked = sensors.length > 0 && sensors.every(s => enabledSensors.has(s.header));
  const noneChecked = sensors.every(s => !enabledSensors.has(s.header));
  const indeterminate = !allChecked && !noneChecked;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        type="checkbox"
        checked={allChecked}
        onChange={() => onToggle(!allChecked)}
        className="accent-blue-500"
      />
    </label>
  );
}

function GraphCategoryItem({ catId, category, enabledSensors, onToggleSensor, onToggleAll }) {
  const [expanded, setExpanded] = useState(false);
  const enabledCount = category.sensors.filter(s => enabledSensors.has(s.header)).length;

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-gray-200/50 dark:hover:bg-gray-800/50">
        <CategoryToggleAll
          sensors={category.sensors}
          enabledSensors={enabledSensors}
          onToggle={(checked) => onToggleAll(catId, checked)}
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-1 text-left text-xs font-medium"
        >
          <span className="text-gray-400 text-[10px] w-3">{expanded ? '\u25be' : '\u25b8'}</span>
          <span>{category.name}</span>
          <span className="text-gray-400 dark:text-gray-500 text-[10px] ml-auto">
            {enabledCount}/{category.sensors.length}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="pl-7 space-y-0.5 pb-1">
          {category.sensors.map(s => (
            <label key={s.header} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-800/50 px-1 py-0.5 rounded">
              <input
                type="checkbox"
                checked={enabledSensors.has(s.header)}
                onChange={() => onToggleSensor(s.header)}
                className="accent-blue-500"
              />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-700 dark:text-gray-300 truncate">{s.header}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const KEY_SENSOR_PATTERNS = [
  { pattern: /CPU Package.*\[\u00b0C\]/i, label: 'CPU Temp' },
  { pattern: /GPU Temperature.*\[\u00b0C\]/i, label: 'GPU Temp' },
  { pattern: /CPU Package Power.*\[W\]/i, label: 'CPU Power' },
  { pattern: /GPU Power.*\[W\]/i, label: 'GPU Power' },
  { pattern: /Total CPU Usage.*\[%\]/i, label: 'CPU Usage' },
  { pattern: /GPU Core Load.*\[%\]/i, label: 'GPU Load' },
];

export default function LeftPanel({ sessions, activeSessions, parsedData, onToggleSession, onDeleteSession, onFileUpload, graphCategories, enabledSensors, onToggleSensor, onToggleAllInCategory }) {
  const handleUploadClick = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  const activeSessionList = sessions.filter(s => activeSessions[s.key]);

  const sessionInfos = useMemo(() =>
    activeSessionList.map(s => {
      const data = parsedData[s.key];
      if (!data) return { session: s, info: null };
      return { session: s, info: getSessionInfo(data.rows) };
    }),
    [activeSessionList, parsedData]
  );

  const quickStats = useMemo(() => {
    const stats = [];
    for (const s of activeSessionList) {
      const data = parsedData[s.key];
      if (!data) continue;
      for (const { pattern, label } of KEY_SENSOR_PATTERNS) {
        const header = data.headers.find(h => pattern.test(h));
        if (!header) continue;
        const values = data.rows.map(r => parseNumericValue(r[header]));
        const computed = computeStats(values);
        if (computed.min === null) continue;
        stats.push({ label, session: s.filename, ...computed, unit: extractUnit(header) });
      }
    }
    return stats;
  }, [activeSessionList, parsedData]);

  const driveHealth = useMemo(() => {
    const items = [];
    for (const s of activeSessionList) {
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
  }, [activeSessionList, parsedData]);

  return (
    <div className="text-sm">
      {/* File Manager */}
      <Section title="FILE MANAGER" defaultOpen={true}>
        <label className="block w-full text-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer text-xs font-medium mb-2">
          Upload CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleUploadClick} />
        </label>
        <div className="space-y-1 max-h-48 overflow-auto">
          {sessions.length === 0 && (
            <p className="text-gray-400 dark:text-gray-500 text-xs text-center py-2">No sessions uploaded</p>
          )}
          {sessions.map(s => (
            <div key={s.key} className="flex items-center gap-2 p-1.5 rounded bg-gray-100 dark:bg-gray-900 text-xs">
              <input
                type="checkbox"
                checked={!!activeSessions[s.key]}
                onChange={() => onToggleSession(s.key)}
                className="accent-blue-500 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{s.filename}</div>
                <div className="text-gray-500 dark:text-gray-400 text-[10px]">
                  {new Date(s.uploadTimestamp).toLocaleDateString()} &mdash; {s.rowCount} rows
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${s.filename}"?`)) onDeleteSession(s.key);
                }}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-1 flex-shrink-0"
                title="Delete"
              >
                X
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Session Info */}
      {sessionInfos.length > 0 && (
        <Section title="SESSION INFO" defaultOpen={true}>
          {sessionInfos.map(({ session, info }) => (
            <div key={session.key} className="mb-2 text-xs">
              <div className="font-medium">{session.filename}</div>
              {info && (
                <div className="text-gray-500 dark:text-gray-400 text-[10px] space-y-0.5 mt-0.5">
                  <div>Start: {info.firstTimestamp.toLocaleString()}</div>
                  <div>End: {info.lastTimestamp.toLocaleString()}</div>
                  <div>Duration: {info.duration}</div>
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Quick Stats */}
      {quickStats.length > 0 && (
        <Section title="QUICK STATS" defaultOpen={true}>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-0.5">Sensor</th>
                <th className="text-right py-0.5">Min</th>
                <th className="text-right py-0.5">Max</th>
                <th className="text-right py-0.5">Avg</th>
              </tr>
            </thead>
            <tbody>
              {quickStats.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-0.5 pr-1">
                    <div>{s.label}</div>
                    {activeSessionList.length > 1 && (
                      <div className="text-gray-400 dark:text-gray-500 text-[9px] truncate">{s.session}</div>
                    )}
                  </td>
                  <td className="text-right py-0.5">{s.min}{s.unit}</td>
                  <td className="text-right py-0.5 font-medium">{s.max}{s.unit}</td>
                  <td className="text-right py-0.5">{s.avg}{s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Drive Health */}
      {driveHealth.length > 0 && (
        <Section title="DRIVE HEALTH" defaultOpen={false}>
          <div className="space-y-1">
            {driveHealth.map((d, i) => {
              let colorClass = 'text-gray-900 dark:text-gray-100';
              if (d.header.toLowerCase().includes('remaining life') && d.value !== null) {
                if (d.value < 20) colorClass = 'text-red-600 dark:text-red-400 font-bold';
                else if (d.value <= 50) colorClass = 'text-yellow-600 dark:text-yellow-400';
              }
              return (
                <div key={i} className="text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400">{d.header}: </span>
                  <span className={colorClass}>{d.value !== null ? `${d.value} ${d.unit}` : 'N/A'}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Graph Controls */}
      {Object.keys(graphCategories).length > 0 && (
        <Section title="GRAPH CONTROLS" defaultOpen={true}>
          {CATEGORY_ORDER.map(id => {
            const cat = graphCategories[id];
            if (!cat) return null;
            return (
              <GraphCategoryItem
                key={id}
                catId={id}
                category={cat}
                enabledSensors={enabledSensors}
                onToggleSensor={onToggleSensor}
                onToggleAll={onToggleAllInCategory}
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}
