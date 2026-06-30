import { useRef, useEffect, useMemo, useCallback } from 'react';
import { parseHWiNFODate } from '../utils/csvParser';
import { parseNumericValue } from '../utils/sanitize';

const HEATMAP_CATEGORIES = [
  { id: 'thermal', label: 'Thermal', match: (h) => h.includes('\u00b0C') && !h.includes('[Yes/No]') },
  { id: 'power', label: 'Power', match: (h) => h.includes('[W]') && !h.includes('[Yes/No]') },
  { id: 'usage', label: 'Usage', match: (h) => h.includes('[%]') && !h.includes('[Yes/No]') },
  { id: 'gpu', label: 'GPU', match: (h) => /^GPU/i.test(h) && !h.includes('[Yes/No]') && !h.includes('\u00b0C') && !h.includes('[W]') && !h.includes('[%]') },
];

const DEFAULT_THRESHOLDS = {
  thermal: { warning: 85 },
  power: { warning: 200 },
  usage: { warning: 95 },
  gpu: { warning: 90 },
};

function getThresholds() {
  if (typeof window !== 'undefined' && typeof window.getActiveThresholds === 'function') {
    try { return window.getActiveThresholds(); } catch { /* fall through */ }
  }
  return DEFAULT_THRESHOLDS;
}

const ROW_HEIGHT = 20;
const BUCKET_SECONDS = 30;

function getColor(ratio) {
  if (ratio < 0.5) return `rgba(34, 197, 94, ${0.3 + ratio * 0.8})`;   // green
  if (ratio < 0.8) return `rgba(234, 179, 8, ${0.4 + (ratio - 0.5) * 1.5})`;  // yellow
  if (ratio < 1.0) return `rgba(249, 115, 22, ${0.5 + (ratio - 0.8) * 2})`;   // orange
  return `rgba(239, 68, 68, ${Math.min(0.6 + (ratio - 1.0) * 0.5, 1)})`;      // red
}

export default function HeatmapTimeline({ sessions, parsedData, zoomRange, onZoomChange, dataTimeRange }) {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  const bucketData = useMemo(() => {
    if (!dataTimeRange) return null;
    const thresholds = getThresholds();
    const { min, max } = dataTimeRange;
    const totalSeconds = (max - min) / 1000;
    const bucketCount = Math.max(1, Math.ceil(totalSeconds / BUCKET_SECONDS));

    const categories = HEATMAP_CATEGORIES.map(cat => {
      const buckets = new Array(bucketCount).fill(null).map(() => ({ peak: 0, peakSensor: '' }));
      const warnThreshold = thresholds[cat.id]?.warning || 100;

      for (const s of sessions) {
        const data = parsedData[s.key];
        if (!data) continue;
        const matchingHeaders = data.headers.filter(h => h !== 'Date' && h !== 'Time' && cat.match(h));
        if (matchingHeaders.length === 0) continue;

        for (const row of data.rows) {
          const ts = parseHWiNFODate(row.Date, row.Time);
          if (!ts) continue;
          const elapsed = (ts.getTime() - min) / 1000;
          const bucketIdx = Math.min(Math.floor(elapsed / BUCKET_SECONDS), bucketCount - 1);
          if (bucketIdx < 0) continue;

          for (const header of matchingHeaders) {
            const val = parseNumericValue(row[header]);
            if (val !== null && val > buckets[bucketIdx].peak) {
              buckets[bucketIdx].peak = val;
              buckets[bucketIdx].peakSensor = header;
            }
          }
        }
      }

      return {
        ...cat,
        buckets,
        warnThreshold,
      };
    });

    return { categories, bucketCount, min, max };
  }, [sessions, parsedData, dataTimeRange]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bucketData) return;
    const ctx = canvas.getContext('2d');
    const { categories, bucketCount } = bucketData;
    const width = canvas.parentElement.clientWidth;
    const height = categories.length * ROW_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    const cellWidth = width / bucketCount;

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      const cat = categories[catIdx];
      const y = catIdx * ROW_HEIGHT;

      // Label
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.label, 4, y + ROW_HEIGHT / 2);

      // Cells
      const labelWidth = 55;
      const cellAreaWidth = width - labelWidth;
      const cw = cellAreaWidth / bucketCount;

      for (let b = 0; b < bucketCount; b++) {
        const bucket = cat.buckets[b];
        if (bucket.peak === 0) continue;
        const ratio = bucket.peak / cat.warnThreshold;
        ctx.fillStyle = getColor(ratio);
        ctx.fillRect(labelWidth + b * cw, y + 1, Math.max(cw - 0.5, 1), ROW_HEIGHT - 2);
      }
    }

    // Draw zoom indicator
    if (zoomRange && bucketData.min != null) {
      const totalRange = bucketData.max - bucketData.min;
      const labelWidth = 55;
      const cellAreaWidth = width - labelWidth;
      const startPct = (zoomRange.min - bucketData.min) / totalRange;
      const endPct = (zoomRange.max - bucketData.min) / totalRange;
      const x1 = labelWidth + startPct * cellAreaWidth;
      const x2 = labelWidth + endPct * cellAreaWidth;

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, 0, x2 - x1, height);
    }
  }, [bucketData, zoomRange]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleClick = useCallback((e) => {
    if (!bucketData || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 55;
    if (x < labelWidth) return;

    const cellAreaWidth = rect.width - labelWidth;
    const pct = (x - labelWidth) / cellAreaWidth;
    const totalRange = bucketData.max - bucketData.min;
    const clickTime = bucketData.min + pct * totalRange;

    // Zoom to ~2 minute window centered on click
    const windowMs = 120000;
    const newMin = Math.max(bucketData.min, clickTime - windowMs / 2);
    const newMax = Math.min(bucketData.max, clickTime + windowMs / 2);
    onZoomChange({ min: newMin, max: newMax });
  }, [bucketData, onZoomChange]);

  const handleMouseMove = useCallback((e) => {
    if (!bucketData || !canvasRef.current || !tooltipRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const labelWidth = 55;

    if (x < labelWidth) {
      tooltipRef.current.style.display = 'none';
      return;
    }

    const catIdx = Math.floor(y / ROW_HEIGHT);
    if (catIdx < 0 || catIdx >= bucketData.categories.length) {
      tooltipRef.current.style.display = 'none';
      return;
    }

    const cellAreaWidth = rect.width - labelWidth;
    const pct = (x - labelWidth) / cellAreaWidth;
    const bucketIdx = Math.min(Math.floor(pct * bucketData.bucketCount), bucketData.bucketCount - 1);
    if (bucketIdx < 0) {
      tooltipRef.current.style.display = 'none';
      return;
    }

    const cat = bucketData.categories[catIdx];
    const bucket = cat.buckets[bucketIdx];
    const time = new Date(bucketData.min + bucketIdx * BUCKET_SECONDS * 1000);

    tooltipRef.current.style.display = 'block';
    tooltipRef.current.style.left = `${x + 10}px`;
    tooltipRef.current.style.top = `${y - 10}px`;
    tooltipRef.current.textContent = bucket.peak > 0
      ? `${cat.label}: ${bucket.peakSensor} peak ${bucket.peak} @ ${time.toLocaleTimeString()}`
      : `${cat.label}: no data @ ${time.toLocaleTimeString()}`;
  }, [bucketData]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (!bucketData) return null;

  return (
    <div className="relative sticky top-0 z-20 bg-gray-950 border-b border-gray-800 mb-3">
      <canvas
        ref={canvasRef}
        className="cursor-pointer w-full"
        style={{ height: `${HEATMAP_CATEGORIES.length * ROW_HEIGHT}px` }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-30"
        style={{ display: 'none' }}
      />
    </div>
  );
}
