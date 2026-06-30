import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Decimation,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'hammerjs';

import LeftPanel from './components/LeftPanel';
import ChartArea from './components/ChartArea';
import AlertPanel from './components/AlertPanel';
import EventsPanel from './components/EventsPanel';
import ComparisonSummary from './components/ComparisonSummary';
import ExportMenu from './components/ExportMenu';
import SettingsPanel from './components/SettingsPanel';
import SystemProfile from './components/SystemProfile';
import { getAllMetadata, getSession, storeSession, deleteSession, getSessionCount } from './utils/db';
import { parseCSV, validateCSV } from './utils/csvParser';
import { sanitizeFilename } from './utils/sanitize';
import { evaluateAlerts } from './utils/alerts';
import { categorizeSensorsForGraphs } from './utils/graphCategories';
import { extractSystemProfile } from './utils/hardware-specs';
import { getActiveThresholds } from './utils/thresholds';
import { detectAutoEvents } from './utils/autoEvents';
import { createLiveMonitor, isFileSystemAccessSupported } from './utils/liveMonitor';
import { loadFolder, isDirectoryPickerSupported } from './utils/multiFile';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Decimation,
  zoomPlugin
);

const SESSION_DASHES = [
  [],
  [6, 3],
  [2, 2],
  [6, 3, 2, 3],
  [8, 4],
  [3, 3],
  [10, 5, 2, 5],
  [4, 4, 1, 4],
];

function getAnnotationStorageKey(sessions) {
  if (sessions.length === 0) return null;
  return `hwinfo-annotations-${sessions[0].key}`;
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState({});
  const [parsedData, setParsedData] = useState({});
  const [theme, setTheme] = useState('dark');
  const [error, setError] = useState(null);
  const [zoomRange, setZoomRange] = useState(null);
  const [enabledSensors, setEnabledSensors] = useState(new Set());
  const [mobilePanel, setMobilePanel] = useState('charts');
  const [annotations, setAnnotations] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonFilename, setComparisonFilename] = useState(null);

  // System profile & threshold state
  const [systemProfile, setSystemProfile] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeThresholds, setActiveThresholds] = useState(() => getActiveThresholds(null));

  // Live mode state
  const [liveMode, setLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState('stopped');
  const [livePaused, setLivePaused] = useState(false);
  const [liveBufferedCount, setLiveBufferedCount] = useState(0);
  const liveMonitorRef = useRef(null);
  const liveSessionKeyRef = useRef(null);

  // Multi-file state
  const [multiFileWarnings, setMultiFileWarnings] = useState([]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const metadata = await getAllMetadata();
      setSessions(metadata);
    } catch { /* IndexedDB unavailable */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleFileUpload = useCallback(async (file) => {
    try {
      const count = await getSessionCount();
      if (count >= 20) {
        setError('Maximum 20 sessions stored. Delete a session before uploading.');
        return;
      }

      const sanitized = sanitizeFilename(file.name);
      const csvText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file, 'windows-1252');
      });

      const { headers, rows, deviceRow } = parseCSV(csvText);
      const validation = validateCSV(headers, rows);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      const key = `${Date.now()}_${sanitized}`;
      await storeSession(key, csvText, {
        uploadTimestamp: Date.now(),
        filename: sanitized,
        rowCount: rows.length,
        columns: headers,
      });

      setError(null);
      await loadSessions();

      setParsedData(pd => ({ ...pd, [key]: { headers, rows, deviceRow } }));
      setActiveSessions(prev => ({ ...prev, [key]: true }));
    } catch (err) {
      setError(err.message || 'Failed to process CSV file');
    }
  }, [loadSessions]);

  const toggleSession = useCallback(async (key) => {
    setActiveSessions(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        setParsedData(pd => {
          const npd = { ...pd };
          delete npd[key];
          return npd;
        });
      } else {
        next[key] = true;
        getSession(key).then(csvText => {
          if (csvText) {
            const { headers, rows, deviceRow } = parseCSV(csvText);
            setParsedData(pd => ({ ...pd, [key]: { headers, rows, deviceRow } }));
          }
        });
      }
      return next;
    });
  }, []);

  const handleDeleteSession = useCallback(async (key) => {
    await deleteSession(key);
    setActiveSessions(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setParsedData(pd => {
      const npd = { ...pd };
      delete npd[key];
      return npd;
    });
    await loadSessions();
  }, [loadSessions]);

  // Update system profile when parsed data changes
  useEffect(() => {
    const keys = Object.keys(activeSessions).filter(k => activeSessions[k]);
    for (const key of keys) {
      const data = parsedData[key];
      if (data?.deviceRow) {
        const profile = extractSystemProfile(data.deviceRow, data.headers);
        if (profile.cpu || profile.gpu || profile.motherboard || profile.drives.length > 0) {
          setSystemProfile(profile);
          setActiveThresholds(getActiveThresholds(profile));
          return;
        }
      }
    }
  }, [activeSessions, parsedData]);

  // === Live Mode ===
  const handleLiveToggle = useCallback(async () => {
    if (liveMode) {
      if (liveMonitorRef.current) {
        liveMonitorRef.current.stop();
        liveMonitorRef.current = null;
      }
      liveSessionKeyRef.current = null;
      setLiveMode(false);
      setLiveStatus('stopped');
      setLivePaused(false);
      setLiveBufferedCount(0);
      return;
    }

    if (!isFileSystemAccessSupported()) {
      setError('Live Mode requires Chrome or Edge. Use manual file reload as a fallback.');
      return;
    }

    const monitor = createLiveMonitor(
      (newRows) => {
        const key = liveSessionKeyRef.current;
        if (!key) return;
        setParsedData(pd => {
          const existing = pd[key];
          if (!existing) return pd;
          return { ...pd, [key]: { ...existing, rows: [...existing.rows, ...newRows] } };
        });
      },
      (status) => setLiveStatus(status),
      2000
    );

    liveMonitorRef.current = monitor;
    const picked = await monitor.pickFile();
    if (!picked) return;

    const initial = await monitor.readInitial();
    if (!initial) { setError('Failed to read the selected file.'); return; }

    const key = `live_${Date.now()}`;
    liveSessionKeyRef.current = key;
    setParsedData(pd => ({ ...pd, [key]: { headers: initial.headers, rows: initial.rows, deviceRow: null } }));
    setActiveSessions(prev => ({ ...prev, [key]: true }));
    setSessions(prev => [...prev, { key, uploadTimestamp: Date.now(), filename: 'LIVE Session', rowCount: initial.rows.length, columns: initial.headers }]);
    monitor.start();
    setLiveMode(true);
    setError(null);
  }, [liveMode]);

  const handleLivePause = useCallback(() => {
    if (!liveMonitorRef.current) return;
    if (livePaused) { liveMonitorRef.current.resume(); setLivePaused(false); }
    else { liveMonitorRef.current.pause(); setLivePaused(true); }
  }, [livePaused]);

  useEffect(() => {
    if (!livePaused || !liveMonitorRef.current) return;
    const id = setInterval(() => setLiveBufferedCount(liveMonitorRef.current?.getBufferedCount() || 0), 1000);
    return () => clearInterval(id);
  }, [livePaused]);

  // === Multi-File Folder Loading ===
  const handleLoadFolder = useCallback(async () => {
    if (!isDirectoryPickerSupported()) { setError('Folder loading requires Chrome or Edge.'); return; }
    try {
      const result = await loadFolder();
      const key = `folder_${Date.now()}`;
      setParsedData(pd => ({ ...pd, [key]: { headers: result.headers, rows: result.rows, deviceRow: null, fileBreaks: result.fileBreaks } }));
      setActiveSessions(prev => ({ ...prev, [key]: true }));
      setSessions(prev => [...prev, { key, uploadTimestamp: Date.now(), filename: `${result.fileCount} files merged`, rowCount: result.rows.length, columns: result.headers }]);
      if (result.profiles.length > 0) {
        setSystemProfile(result.profiles[0].profile);
        setActiveThresholds(getActiveThresholds(result.profiles[0].profile));
      }
      if (result.warnings.length > 0) setMultiFileWarnings(result.warnings);
      setError(null);
    } catch (err) { setError(err.message || 'Failed to load folder.'); }
  }, []);

  // Cleanup live monitor on unmount
  useEffect(() => () => { if (liveMonitorRef.current) liveMonitorRef.current.stop(); }, []);

  const activeSessionList = useMemo(
    () =>
      sessions
        .filter(s => activeSessions[s.key])
        .map((s, i) => ({ ...s, dash: SESSION_DASHES[i % SESSION_DASHES.length] })),
    [sessions, activeSessions]
  );

  // Load annotations from localStorage when active sessions change
  useEffect(() => {
    const key = getAnnotationStorageKey(activeSessionList);
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) setAnnotations(JSON.parse(stored));
        else setAnnotations([]);
      } catch { setAnnotations([]); }
    } else {
      setAnnotations([]);
    }
  }, [activeSessionList.length > 0 ? activeSessionList[0]?.key : null]);

  const handleAnnotationAdd = useCallback((annotation) => {
    setAnnotations(prev => {
      const next = [...prev, annotation];
      const key = getAnnotationStorageKey(activeSessionList);
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next;
    });
  }, [activeSessionList]);

  const handleAnnotationDelete = useCallback((time) => {
    setAnnotations(prev => {
      const next = prev.filter(a => a.time !== time);
      const key = getAnnotationStorageKey(activeSessionList);
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next;
    });
  }, [activeSessionList]);

  const handleZoomToTime = useCallback((time) => {
    setZoomRange({ min: time - 30000, max: time + 30000 });
  }, []);

  // Auto-detected events
  const autoEvents = useMemo(() => {
    const allEvents = [];
    const keys = Object.keys(activeSessions).filter(k => activeSessions[k]);
    for (const key of keys) {
      const data = parsedData[key];
      if (!data) continue;
      const events = detectAutoEvents(data.headers, data.rows, systemProfile);
      allEvents.push(...events);
    }
    allEvents.sort((a, b) => a.time - b.time);
    return allEvents;
  }, [activeSessions, parsedData, systemProfile]);

  // Comparison file handling
  const handleCompareFile = useCallback(async (file) => {
    try {
      const csvText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file, 'windows-1252');
      });

      const { headers, rows, deviceRow } = parseCSV(csvText);
      const validation = validateCSV(headers, rows);
      if (!validation.valid) {
        setError(`Compare file: ${validation.error}`);
        return;
      }

      setComparisonData({ headers, rows, deviceRow });
      setComparisonFilename(sanitizeFilename(file.name));
    } catch (err) {
      setError(`Compare file: ${err.message}`);
    }
  }, []);

  const handleRemoveComparison = useCallback(() => {
    setComparisonData(null);
    setComparisonFilename(null);
  }, []);

  const allHeaders = useMemo(
    () => [...new Set(Object.keys(activeSessions).flatMap(k => parsedData[k]?.headers || []))],
    [activeSessions, parsedData]
  );

  const graphCategories = useMemo(
    () => categorizeSensorsForGraphs(allHeaders),
    [allHeaders]
  );

  const toggleSensor = useCallback((header) => {
    setEnabledSensors(prev => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header);
      else next.add(header);
      return next;
    });
  }, []);

  const toggleAllInCategory = useCallback((catId, checked) => {
    setEnabledSensors(prev => {
      const next = new Set(prev);
      const cat = graphCategories[catId];
      if (!cat) return prev;
      for (const s of cat.sensors) {
        if (checked) next.add(s.header);
        else next.delete(s.header);
      }
      return next;
    });
  }, [graphCategories]);

  const alerts = useMemo(() => {
    const all = [];
    for (const s of activeSessionList) {
      const data = parsedData[s.key];
      if (!data) continue;
      const sessionAlerts = evaluateAlerts(data.headers, data.rows);
      all.push(...sessionAlerts.map(a => ({ ...a, session: s.filename })));
    }
    return all;
  }, [activeSessionList, parsedData]);

  const hasData = activeSessionList.length > 0;

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
        <span className="font-semibold text-sm text-blue-600 dark:text-blue-400">HWiNFO Dashboard</span>
        <div className="flex items-center gap-2">
          {/* Live Mode */}
          <div className="flex items-center gap-1.5">
            {liveMode && (
              <span className="flex items-center gap-1 text-[10px]">
                <span className={`w-2 h-2 rounded-full ${
                  liveStatus === 'active' ? 'bg-green-500 animate-pulse' :
                  liveStatus === 'waiting' ? 'bg-yellow-500' :
                  liveStatus === 'paused' ? 'bg-blue-500' : 'bg-gray-500'
                }`} />
                <span className="text-green-400 font-bold">LIVE</span>
              </span>
            )}
            <button onClick={handleLiveToggle} className={`text-[10px] px-2 py-1 rounded ${
              liveMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {liveMode ? 'Stop Live' : 'Live Mode'}
            </button>
            {liveMode && (
              <button onClick={handleLivePause} className="text-[10px] px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                {livePaused ? `Resume (${liveBufferedCount})` : 'Pause'}
              </button>
            )}
          </div>

          {/* Load Folder */}
          <button onClick={handleLoadFolder} className="text-[10px] px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" title="Load folder of CSV files">
            Load Folder
          </button>

          {/* Settings */}
          <button onClick={() => setSettingsOpen(true)} className="text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800" title="Threshold Settings">
            &#9881;
          </button>

          {/* Compare button */}
          {hasData && !comparisonData && (
            <label className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium cursor-pointer">
              Compare
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleCompareFile(f); e.target.value = ''; }
                }}
              />
            </label>
          )}
          {comparisonData && (
            <button
              onClick={handleRemoveComparison}
              className="text-xs px-3 py-1 bg-purple-600/50 hover:bg-purple-600/70 text-white rounded font-medium"
            >
              Remove Compare
            </button>
          )}

          {/* Export button */}
          {hasData && (
            <ExportMenu
              sessions={activeSessionList}
              parsedData={parsedData}
              enabledSensors={enabledSensors}
              graphCategories={graphCategories}
            />
          )}

          <div className="flex gap-1 md:hidden">
            {['left', 'charts', 'alerts'].map(panel => (
              <button
                key={panel}
                onClick={() => setMobilePanel(panel)}
                className={`text-xs px-2 py-1 rounded ${
                  mobilePanel === panel
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {panel === 'left' ? 'Info' : panel === 'charts' ? 'Charts' : 'Alerts'}
              </button>
            ))}
          </div>
          <button
            onClick={toggleTheme}
            className="text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/50 border-b border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 px-4 py-2 text-sm flex-shrink-0">
          {error}
          <button className="ml-4 text-red-600 dark:text-red-400 hover:underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {multiFileWarnings.length > 0 && (
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 px-4 py-2 text-xs flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>{multiFileWarnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            <button className="text-yellow-600 dark:text-yellow-400 hover:underline ml-4" onClick={() => setMultiFileWarnings([])}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className={`w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto ${mobilePanel !== 'left' ? 'hidden md:block' : ''}`}>
          <SystemProfile profile={systemProfile} />
          <LeftPanel
            sessions={sessions}
            activeSessions={activeSessions}
            parsedData={parsedData}
            onToggleSession={toggleSession}
            onDeleteSession={handleDeleteSession}
            onFileUpload={handleFileUpload}
            graphCategories={graphCategories}
            enabledSensors={enabledSensors}
            onToggleSensor={toggleSensor}
            onToggleAllInCategory={toggleAllInCategory}
          />
        </div>

        {/* Center - Charts */}
        <div className={`flex-1 overflow-y-auto ${mobilePanel !== 'charts' ? 'hidden md:block' : ''}`}>
          <div data-chart-area>
            <ChartArea
              sessions={activeSessionList}
              parsedData={parsedData}
              graphCategories={graphCategories}
              enabledSensors={enabledSensors}
              onFileUpload={handleFileUpload}
              zoomRange={zoomRange}
              onZoomChange={setZoomRange}
              theme={theme}
              annotations={annotations}
              autoEvents={autoEvents}
              onAnnotationAdd={handleAnnotationAdd}
              comparisonData={comparisonData}
              comparisonSession={comparisonFilename}
            />
          </div>
        </div>

        {/* Right Panel - Alerts + Events + Comparison */}
        <div className={`w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 overflow-y-auto ${mobilePanel !== 'alerts' ? 'hidden md:block' : ''}`}>
          <AlertPanel alerts={alerts} hasData={hasData} />
          <EventsPanel
            annotations={annotations}
            autoEvents={autoEvents}
            onDeleteAnnotation={handleAnnotationDelete}
            onZoomToTime={handleZoomToTime}
          />
          {comparisonData && (
            <ComparisonSummary
              sessions={activeSessionList}
              parsedData={parsedData}
              comparisonData={comparisonData}
              comparisonFilename={comparisonFilename}
              onRemove={handleRemoveComparison}
            />
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        systemProfile={systemProfile}
        onThresholdsChange={setActiveThresholds}
      />
    </div>
  );
}
