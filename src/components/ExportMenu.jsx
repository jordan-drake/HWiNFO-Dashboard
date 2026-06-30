import { useState, useRef, useEffect, useCallback } from 'react';
import { downloadCSV } from '../utils/exportCsv';
import { parseNumericValue } from '../utils/sanitize';
import { computeStats, extractUnit } from '../utils/briefing';

export default function ExportMenu({ sessions, parsedData, enabledSensors, graphCategories }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const getDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const exportPNG = useCallback(async () => {
    setExporting('png');
    setOpen(false);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const chartArea = document.querySelector('[data-chart-area]');
      if (!chartArea) return;
      const canvas = await html2canvas(chartArea, {
        backgroundColor: '#030712',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `hwinfo-report-${getDateStr()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setExporting(null);
    }
  }, []);

  const exportPDF = useCallback(async () => {
    setExporting('pdf');
    setOpen(false);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Title page
      doc.setFontSize(20);
      doc.setTextColor(59, 130, 246);
      doc.text('HWiNFO Dashboard Report', 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

      let yPos = 40;
      for (const s of sessions) {
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(`Session: ${s.filename}`, 14, yPos);
        yPos += 8;
      }

      // Capture each chart
      const charts = document.querySelectorAll('[data-chart-area] .bg-gray-50, [data-chart-area] .dark\\:bg-gray-900');
      for (const chart of charts) {
        const canvas = await html2canvas(chart, {
          backgroundColor: '#111827',
          scale: 2,
        });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 20;
        const imgHeight = (canvas.height / canvas.width) * imgWidth;

        if (yPos + imgHeight > pageHeight - 10) {
          doc.addPage();
          yPos = 10;
        }
        doc.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      }

      doc.save(`hwinfo-report-${getDateStr()}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(null);
    }
  }, [sessions]);

  const exportCSVSummary = useCallback(() => {
    setOpen(false);
    const lines = ['Sensor,Min,Avg,Max,Unit'];
    const allHeaders = [...enabledSensors];

    for (const header of allHeaders) {
      for (const s of sessions) {
        const data = parsedData[s.key];
        if (!data || !data.headers.includes(header)) continue;
        const values = data.rows.map(r => parseNumericValue(r[header]));
        const stats = computeStats(values);
        const unit = extractUnit(header);
        const sensorLabel = sessions.length > 1 ? `${header} (${s.filename})` : header;
        lines.push(`"${sensorLabel}",${stats.min ?? ''},${stats.avg ?? ''},${stats.max ?? ''},${unit}`);
      }
    }

    downloadCSV(lines.join('\n'), `hwinfo-summary-${getDateStr()}.csv`);
  }, [sessions, parsedData, enabledSensors]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
        disabled={!!exporting}
      >
        {exporting ? `Exporting ${exporting.toUpperCase()}...` : 'Export'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px]">
          <button
            onClick={exportPNG}
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-700 text-gray-200 rounded-t-lg"
          >
            Export PNG
          </button>
          <button
            onClick={exportPDF}
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-700 text-gray-200"
          >
            Export PDF
          </button>
          <button
            onClick={exportCSVSummary}
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-700 text-gray-200 rounded-b-lg"
          >
            Export CSV Summary
          </button>
        </div>
      )}
    </div>
  );
}
