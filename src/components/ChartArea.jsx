import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { parseHWiNFODate } from '../utils/csvParser';
import { parseNumericValue } from '../utils/sanitize';
import { downsampleDataset } from '../utils/downsample';
import { computeStats, extractUnit } from '../utils/briefing';
import HeatmapTimeline from './HeatmapTimeline';

const THEME_CHART = {
  dark: { grid: '#374151', tick: '#9ca3af', legend: '#d1d5db', title: '#e5e7eb' },
  light: { grid: '#e5e7eb', tick: '#4b5563', legend: '#374151', title: '#111827' },
};

function DropZone({ onFileUpload }) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) onFileUpload(file);
  };

  return (
    <div
      className={`flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed rounded-xl transition-colors ${
        dragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-5xl mb-4 opacity-40">+</div>
      <div className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-1">
        Drop HWiNFO CSV here
      </div>
      <div className="text-sm text-gray-400 dark:text-gray-500 mb-4">
        or use the Upload button in the left panel
      </div>
      <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer text-sm font-medium">
        Choose File
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onFileUpload(f); e.target.value = ''; }
          }}
        />
      </label>
    </div>
  );
}

/* ── Zoom Stats Overlay ─────────────────────────────────────── */
function ZoomStatsOverlay({ sensors, sessions, parsedData, zoomRange }) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when zoom changes
  useEffect(() => { setDismissed(false); }, [zoomRange?.min, zoomRange?.max]);

  const stats = useMemo(() => {
    if (!zoomRange || dismissed) return [];
    const results = [];
    for (const sensor of sensors) {
      for (const session of sessions) {
        const data = parsedData[session.key];
        if (!data || !data.headers.includes(sensor.header)) continue;
        const values = [];
        for (const row of data.rows) {
          const ts = parseHWiNFODate(row.Date, row.Time);
          if (!ts) continue;
          const t = ts.getTime();
          if (t < zoomRange.min || t > zoomRange.max) continue;
          const v = parseNumericValue(row[sensor.header]);
          if (v !== null) values.push(v);
        }
        if (values.length === 0) continue;
        const s = computeStats(values);
        const unit = extractUnit(sensor.header);
        results.push({
          label: sessions.length > 1 ? `${sensor.header} (${session.filename})` : sensor.header,
          ...s,
          unit,
        });
      }
    }
    return results;
  }, [sensors, sessions, parsedData, zoomRange, dismissed]);

  if (!zoomRange || dismissed || stats.length === 0) return null;

  const startTime = new Date(zoomRange.min).toLocaleTimeString();
  const endTime = new Date(zoomRange.max).toLocaleTimeString();
  const durationMs = zoomRange.max - zoomRange.min;
  const durationStr = durationMs < 60000
    ? `${Math.round(durationMs / 1000)}s`
    : `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;

  return (
    <div className="absolute top-2 left-2 z-20 bg-gray-900/85 backdrop-blur-sm rounded-lg px-3 py-2 text-[10px] text-gray-200 max-w-[320px] border border-gray-700/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400">Selection: {startTime} -- {endTime} ({durationStr})</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-500 hover:text-gray-300 ml-2"
        >
          x
        </button>
      </div>
      {stats.map((s, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="truncate">{s.label}:</span>
          <span className="whitespace-nowrap">
            Min {s.min}{s.unit}  Avg {s.avg}{s.unit}  Max {s.max}{s.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Custom Scrollbar ────────────────────────────────────────── */
function CustomScrollbar({ zoomRange, dataTimeRange, onPan }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const startInfoRef = useRef(null);

  if (!zoomRange || !dataTimeRange) return null;

  const totalRange = dataTimeRange.max - dataTimeRange.min;
  const viewRange = zoomRange.max - zoomRange.min;
  const thumbSize = Math.max((viewRange / totalRange) * 100, 5);
  const thumbPos = ((zoomRange.min - dataTimeRange.min) / totalRange) * 100;

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const trackRect = trackRef.current.getBoundingClientRect();
    startInfoRef.current = {
      startX: e.clientX,
      startMin: zoomRange.min,
      trackWidth: trackRect.width,
    };
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current || !startInfoRef.current) return;
    const { startX, startMin, trackWidth } = startInfoRef.current;
    const dx = e.clientX - startX;
    const pctMoved = dx / trackWidth;
    const timeMoved = pctMoved * totalRange;
    const newMin = Math.max(dataTimeRange.min, Math.min(dataTimeRange.max - viewRange, startMin + timeMoved));
    onPan({ min: newMin, max: newMin + viewRange });
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    startInfoRef.current = null;
  };

  const handleTrackClick = (e) => {
    if (e.target !== trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const centerTime = dataTimeRange.min + clickPct * totalRange;
    const halfView = viewRange / 2;
    const newMin = Math.max(dataTimeRange.min, Math.min(dataTimeRange.max - viewRange, centerTime - halfView));
    onPan({ min: newMin, max: newMin + viewRange });
  };

  return (
    <div
      ref={trackRef}
      className="relative w-full h-2 bg-gray-800/60 rounded-full mt-1 cursor-pointer"
      onClick={handleTrackClick}
    >
      <div
        className="absolute top-0 h-full bg-blue-500/50 hover:bg-blue-500/70 rounded-full cursor-grab active:cursor-grabbing"
        style={{ left: `${thumbPos}%`, width: `${thumbSize}%`, minWidth: '12px' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}

/* ── Annotation Rendering Plugin for Chart.js ────────────────── */
function makeAnnotationPlugin(annotations, autoEvents) {
  return {
    id: 'annotationLines',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;
      const xScale = scales.x;
      const allMarkers = [
        ...(annotations || []).map(a => ({ ...a, isAuto: false })),
        ...(autoEvents || []).map(a => ({ ...a, isAuto: true })),
      ];

      for (const marker of allMarkers) {
        const px = xScale.getPixelForValue(marker.time);
        if (px < chartArea.left || px > chartArea.right) continue;

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = marker.isAuto ? '#f97316' : '#ffffff';
        ctx.lineWidth = 1;
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw label rotated at top
        if (marker.label) {
          ctx.save();
          ctx.translate(px + 4, chartArea.top + 8);
          ctx.rotate(-Math.PI / 4);
          ctx.fillStyle = marker.isAuto ? '#fb923c' : '#e5e7eb';
          ctx.font = '9px sans-serif';
          ctx.fillText(marker.label, 0, 0);
          ctx.restore();
        }
        ctx.restore();
      }
    },
  };
}

/* ── Annotation Input Popup ──────────────────────────────────── */
function AnnotationPopup({ x, y, onConfirm, onCancel }) {
  const inputRef = useRef(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) onConfirm(text.trim());
  };

  return (
    <div
      className="absolute z-30 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <form onSubmit={handleSubmit} className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add annotation..."
          className="bg-gray-900 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 w-48 outline-none focus:border-blue-500"
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        />
        <button type="submit" className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">
          Add
        </button>
      </form>
    </div>
  );
}

/* ── Category Graph ──────────────────────────────────────────── */
function CategoryGraph({
  category, sensors, sessions, parsedData, enabledSensors, zoomRange, onZoomComplete,
  theme, annotations, autoEvents, onAnnotationAdd, dataTimeRange,
  comparisonData, comparisonSession,
}) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const highlightRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0 });
  const colors = THEME_CHART[theme] || THEME_CHART.dark;
  const visibleSensors = sensors.filter(s => enabledSensors.has(s.header));
  const [annotationPopup, setAnnotationPopup] = useState(null);

  // Manual drag-to-zoom: mousedown records start position
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = { active: true, startX: e.clientX - rect.left };
    if (highlightRef.current) highlightRef.current.style.display = 'none';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (highlightRef.current) {
      const left = Math.min(dragRef.current.startX, x);
      const width = Math.abs(x - dragRef.current.startX);
      highlightRef.current.style.left = `${left}px`;
      highlightRef.current.style.width = `${width}px`;
      highlightRef.current.style.display = width > 5 ? 'block' : 'none';
    }
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (highlightRef.current) highlightRef.current.style.display = 'none';

    const chart = chartRef.current;
    if (!chart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const startX = dragRef.current.startX;

    if (Math.abs(endX - startX) > 10) {
      const { left, right } = chart.chartArea;
      const minPx = Math.max(Math.min(startX, endX), left);
      const maxPx = Math.min(Math.max(startX, endX), right);
      const minVal = chart.scales.x.getValueForPixel(minPx);
      const maxVal = chart.scales.x.getValueForPixel(maxPx);
      if (minVal < maxVal) {
        onZoomComplete({ min: minVal, max: maxVal });
      }
    }
  }, [onZoomComplete]);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    if (highlightRef.current) highlightRef.current.style.display = 'none';
  }, []);

  // Double-click to add annotation
  const handleDoubleClick = useCallback((e) => {
    const chart = chartRef.current;
    if (!chart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { left, right } = chart.chartArea;
    if (x < left || x > right) return;
    const timeValue = chart.scales.x.getValueForPixel(x);
    setAnnotationPopup({ x: x, y: y, time: timeValue });
  }, []);

  const handleAnnotationConfirm = useCallback((text) => {
    if (annotationPopup && onAnnotationAdd) {
      onAnnotationAdd({ time: annotationPopup.time, label: text });
    }
    setAnnotationPopup(null);
  }, [annotationPopup, onAnnotationAdd]);

  // Ctrl+scroll wheel to pan
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey) return; // Let plain scroll pass through to page
    e.preventDefault();

    const currentZoom = zoomRange || dataTimeRange;
    if (!currentZoom || !dataTimeRange) return;

    const viewRange = currentZoom.max - currentZoom.min;
    // Pan amount proportional to zoom level
    const panAmount = viewRange * 0.05 * (e.deltaY > 0 ? 1 : -1);
    const totalRange = dataTimeRange.max - dataTimeRange.min;

    const newMin = Math.max(dataTimeRange.min, Math.min(dataTimeRange.max - viewRange, currentZoom.min + panAmount));
    const newMax = newMin + viewRange;

    // Only zoom if actually zoomed in
    if (viewRange < totalRange * 0.99) {
      onZoomComplete({ min: newMin, max: newMax });
    }
  }, [zoomRange, dataTimeRange, onZoomComplete]);

  const annotationPlugin = useMemo(
    () => makeAnnotationPlugin(annotations, autoEvents),
    [annotations, autoEvents]
  );

  const chartData = useMemo(() => {
    const datasets = [];
    for (const sensor of visibleSensors) {
      // Primary sessions
      for (const session of sessions) {
        const data = parsedData[session.key];
        if (!data || !data.headers.includes(sensor.header)) continue;

        const points = data.rows.map(row => {
          const ts = parseHWiNFODate(row.Date, row.Time);
          const val = parseNumericValue(row[sensor.header]);
          return { x: ts ? ts.getTime() : null, y: val };
        }).filter(p => p.x && p.y !== null);

        const sampled = downsampleDataset(points);
        datasets.push({
          label: sessions.length > 1 ? `${sensor.header} (${session.filename})` : sensor.header,
          data: sampled,
          borderColor: sensor.color,
          backgroundColor: sensor.color + '33',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 10,
          tension: 0,
          borderDash: session.dash || [],
        });
      }

      // Comparison session overlay
      if (comparisonData && comparisonData.headers.includes(sensor.header)) {
        const compStartTime = parseHWiNFODate(comparisonData.rows[0]?.Date, comparisonData.rows[0]?.Time);
        const primaryStartTime = sessions[0] && parsedData[sessions[0].key]
          ? parseHWiNFODate(parsedData[sessions[0].key].rows[0]?.Date, parsedData[sessions[0].key].rows[0]?.Time)
          : null;

        if (compStartTime && primaryStartTime) {
          const offset = primaryStartTime.getTime() - compStartTime.getTime();
          const points = comparisonData.rows.map(row => {
            const ts = parseHWiNFODate(row.Date, row.Time);
            const val = parseNumericValue(row[sensor.header]);
            return { x: ts ? ts.getTime() + offset : null, y: val };
          }).filter(p => p.x && p.y !== null);

          const sampled = downsampleDataset(points);
          datasets.push({
            label: `${sensor.header} (Compare)`,
            data: sampled,
            borderColor: sensor.color + '80',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHitRadius: 10,
            tension: 0,
            borderDash: [6, 4],
          });
        }
      }
    }
    return { datasets };
  }, [visibleSensors, sessions, parsedData, comparisonData]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    transitions: {
      active: { animation: { duration: 0 } },
    },
    parsing: false,
    scales: {
      x: {
        type: 'linear',
        min: zoomRange?.min,
        max: zoomRange?.max,
        ticks: {
          color: colors.tick,
          callback(value) { return new Date(value).toLocaleTimeString(); },
          maxTicksLimit: 8,
        },
        grid: { color: colors.grid },
      },
      y: {
        ticks: { color: colors.tick },
        grid: { color: colors.grid },
        grace: '10%',
      },
    },
    plugins: {
      legend: {
        labels: { color: colors.legend, boxWidth: 12, font: { size: 10 } },
      },
      title: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        animation: { duration: 0 },
        callbacks: {
          title: (items) => items.length > 0 ? new Date(items[0].parsed.x).toLocaleString() : '',
        },
      },
      decimation: {
        enabled: true,
        algorithm: 'lttb',
        samples: 500,
        threshold: 500,
      },
      zoom: {
        pan: { enabled: false },
        zoom: {
          drag: { enabled: false },
          wheel: { enabled: false },
          pinch: { enabled: false },
        },
      },
    },
  }), [zoomRange, colors]);

  const plugins = useMemo(() => [annotationPlugin], [annotationPlugin]);

  if (visibleSensors.length === 0) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          {category.name}
        </span>
        {zoomRange && (
          <button
            onClick={() => onZoomComplete(null)}
            className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded"
          >
            Reset
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="relative select-none cursor-crosshair"
        style={{ height: '350px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        <div
          ref={highlightRef}
          className="absolute top-0 bottom-0 bg-blue-500/15 border-x border-blue-500/50 pointer-events-none z-10"
          style={{ display: 'none', left: 0, width: 0 }}
        />
        {/* Zoom stats overlay */}
        <ZoomStatsOverlay
          sensors={visibleSensors}
          sessions={sessions}
          parsedData={parsedData}
          zoomRange={zoomRange}
        />
        <Line ref={chartRef} data={chartData} options={options} plugins={plugins} />
        {/* Annotation popup */}
        {annotationPopup && (
          <AnnotationPopup
            x={annotationPopup.x}
            y={annotationPopup.y}
            onConfirm={handleAnnotationConfirm}
            onCancel={() => setAnnotationPopup(null)}
          />
        )}
      </div>
      {/* Custom scrollbar */}
      <CustomScrollbar
        zoomRange={zoomRange}
        dataTimeRange={dataTimeRange}
        onPan={onZoomComplete}
      />
    </div>
  );
}

/* ── Main ChartArea Component ────────────────────────────────── */
export default function ChartArea({
  sessions, parsedData, graphCategories, enabledSensors, onFileUpload,
  zoomRange, onZoomChange, theme,
  annotations, autoEvents, onAnnotationAdd,
  comparisonData, comparisonSession,
}) {
  const dataTimeRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const s of sessions) {
      const data = parsedData[s.key];
      if (!data || data.rows.length === 0) continue;
      const first = parseHWiNFODate(data.rows[0].Date, data.rows[0].Time);
      const last = parseHWiNFODate(data.rows[data.rows.length - 1].Date, data.rows[data.rows.length - 1].Time);
      if (first && first.getTime() < min) min = first.getTime();
      if (last && last.getTime() > max) max = last.getTime();
    }
    return min < max ? { min, max } : null;
  }, [sessions, parsedData]);

  const handleZoomComplete = useCallback((range) => {
    onZoomChange(range);
  }, [onZoomChange]);

  if (sessions.length === 0) {
    return (
      <div className="h-full p-4">
        <DropZone onFileUpload={onFileUpload} />
      </div>
    );
  }

  const categoryOrder = ['thermal', 'power', 'usage', 'fan', 'clock', 'throughput', 'other'];
  const orderedCategories = categoryOrder
    .filter(id => graphCategories[id])
    .map(id => ({ id, ...graphCategories[id] }));

  return (
    <div className="p-4">
      {/* Heatmap Timeline */}
      <HeatmapTimeline
        sessions={sessions}
        parsedData={parsedData}
        zoomRange={zoomRange}
        onZoomChange={onZoomChange}
        dataTimeRange={dataTimeRange}
      />

      {orderedCategories.map(cat => (
        <CategoryGraph
          key={cat.id}
          category={cat}
          sensors={cat.sensors}
          sessions={sessions}
          parsedData={parsedData}
          enabledSensors={enabledSensors}
          zoomRange={zoomRange}
          onZoomComplete={handleZoomComplete}
          theme={theme}
          annotations={annotations}
          autoEvents={autoEvents}
          onAnnotationAdd={onAnnotationAdd}
          dataTimeRange={dataTimeRange}
          comparisonData={comparisonData}
          comparisonSession={comparisonSession}
        />
      ))}

      {!orderedCategories.some(cat => cat.sensors.some(s => enabledSensors.has(s.header))) && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
          <div className="text-lg mb-2">No sensors selected</div>
          <div className="text-sm">Select sensors from the left panel to view graphs.</div>
        </div>
      )}
    </div>
  );
}
