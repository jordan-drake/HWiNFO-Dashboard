// Live monitoring mode using File System Access API.
// Polls a file handle for new data and incrementally parses appended rows.

import Papa from 'papaparse';
import { disambiguateHeaders, parseHWiNFODate } from './csvParser';
import { sanitizeHeader, parseNumericValue } from './sanitize';

/**
 * Check if the File System Access API is available.
 */
export function isFileSystemAccessSupported() {
  return typeof window.showOpenFilePicker === 'function';
}

/**
 * Create a live monitor instance that polls a file for new data.
 *
 * @param {function} onNewRows - Callback with (newRows, allHeaders) when new data arrives
 * @param {function} onStatusChange - Callback with status: 'active'|'waiting'|'paused'|'stopped'
 * @param {number} intervalMs - Polling interval in milliseconds (default 2000)
 * @returns {object} Monitor control object
 */
export function createLiveMonitor(onNewRows, onStatusChange, intervalMs = 2000) {
  let fileHandle = null;
  let headers = null;
  let previousSize = 0;
  let intervalId = null;
  let paused = false;
  let bufferedRows = [];
  let lastDataTime = Date.now();
  let watchdogId = null;
  let headerLine = '';

  async function pickFile() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
      });
      fileHandle = handle;
      return true;
    } catch {
      return false; // User cancelled
    }
  }

  async function readInitial() {
    if (!fileHandle) return null;
    const file = await fileHandle.getFile();
    const text = await readFileAsWindows1252(file);
    previousSize = file.size;

    // Parse the full file to get headers and initial data
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
    if (!parsed.data || parsed.data.length < 2) return null;

    let rawHeaders = parsed.data[0];
    if (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1].trim() === '') {
      rawHeaders = rawHeaders.slice(0, -1);
    }
    headers = disambiguateHeaders(rawHeaders);
    headerLine = parsed.data[0].join(',');

    const rows = [];
    for (let i = 1; i < parsed.data.length; i++) {
      const row = parseDataRow(parsed.data[i], headers);
      if (row) rows.push(row);
    }

    lastDataTime = Date.now();
    return { headers, rows };
  }

  function parseDataRow(rawRow, hdrs) {
    if (!rawRow || rawRow.length < 2) return null;
    const firstCell = (rawRow[0] || '').trim();

    // Skip repeated headers
    if (firstCell === 'Date') return null;
    // Skip hardware description rows
    if (firstCell === '' && rawRow.length > 1 && rawRow.some((c, idx) => idx > 0 && c && c.trim() !== '')) return null;
    // Must have valid date
    if (!firstCell.includes('.')) return null;

    const colCount = hdrs.length;
    const trimmedRow = rawRow.slice(0, colCount);
    const rowObj = {};
    for (let j = 0; j < colCount; j++) {
      rowObj[hdrs[j]] = trimmedRow[j] !== undefined ? trimmedRow[j] : '';
    }
    return rowObj;
  }

  async function poll() {
    if (!fileHandle || paused) return;

    try {
      const file = await fileHandle.getFile();
      if (file.size <= previousSize) return;

      // Read only the new bytes
      const newBlob = file.slice(previousSize);
      const newText = await readBlobAsWindows1252(newBlob);
      previousSize = file.size;

      if (!newText.trim()) return;

      // Parse the new chunk
      const lines = newText.split('\n').filter(l => l.trim());
      const newRows = [];

      for (const line of lines) {
        const parsed = Papa.parse(line, { header: false });
        if (parsed.data && parsed.data[0]) {
          const row = parseDataRow(parsed.data[0], headers);
          if (row) newRows.push(row);
        }
      }

      if (newRows.length > 0) {
        lastDataTime = Date.now();
        if (paused) {
          bufferedRows.push(...newRows);
        } else {
          onNewRows(newRows, headers);
        }
        onStatusChange('active');
      }
    } catch (err) {
      console.warn('Live monitor poll error:', err);
    }
  }

  function startWatchdog() {
    watchdogId = setInterval(() => {
      if (paused) {
        onStatusChange('paused');
        return;
      }
      const elapsed = Date.now() - lastDataTime;
      if (elapsed > 10000) {
        onStatusChange('waiting');
      }
    }, 5000);
  }

  function start() {
    if (intervalId) return;
    paused = false;
    intervalId = setInterval(poll, intervalMs);
    startWatchdog();
    onStatusChange('active');
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (watchdogId) {
      clearInterval(watchdogId);
      watchdogId = null;
    }
    fileHandle = null;
    headers = null;
    previousSize = 0;
    bufferedRows = [];
    onStatusChange('stopped');
  }

  function pause() {
    paused = true;
    onStatusChange('paused');
  }

  function resume() {
    paused = false;
    if (bufferedRows.length > 0) {
      onNewRows(bufferedRows, headers);
      bufferedRows = [];
    }
    onStatusChange('active');
  }

  function getBufferedCount() {
    return bufferedRows.length;
  }

  return {
    pickFile,
    readInitial,
    start,
    stop,
    pause,
    resume,
    getBufferedCount,
    isPaused: () => paused,
    isRunning: () => intervalId !== null,
  };
}

function readFileAsWindows1252(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'windows-1252');
  });
}

function readBlobAsWindows1252(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsText(blob, 'windows-1252');
  });
}
