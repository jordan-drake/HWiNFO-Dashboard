import { useCallback } from 'react';
import { sanitizeFilename } from '../utils/sanitize';
import { parseCSV, validateCSV } from '../utils/csvParser';
import { storeSession, deleteSession, getSessionCount } from '../utils/db';

export default function FileManager({ sessions, activeSessions, onToggleSession, onSessionsChanged, error, setError }) {
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

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

      const { headers, rows } = parseCSV(csvText);
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
      await onSessionsChanged();
    } catch (err) {
      setError(err.message || 'Failed to process CSV file');
    }
  }, [onSessionsChanged, setError]);

  const handleDelete = useCallback(async (key, filename) => {
    if (!window.confirm(`Delete session "${filename}"?`)) return;
    await deleteSession(key);
    await onSessionsChanged();
  }, [onSessionsChanged]);

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">File Manager</h2>
      <label className="block w-full text-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer text-sm font-medium mb-3">
        Upload CSV
        <input type="file" accept=".csv" className="hidden" onChange={handleUpload} />
      </label>
      <div className="space-y-1 max-h-64 overflow-auto">
        {sessions.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 text-xs text-center py-2">No sessions uploaded</p>
        )}
        {sessions.map(s => (
          <div key={s.key} className="flex items-center gap-2 p-2 rounded bg-gray-100 dark:bg-gray-900 text-xs">
            <input
              type="checkbox"
              checked={!!activeSessions[s.key]}
              onChange={() => onToggleSession(s.key)}
              className="accent-blue-500"
            />
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{s.filename}</div>
              <div className="text-gray-500">
                {new Date(s.uploadTimestamp).toLocaleDateString()} — {s.rowCount} rows
              </div>
            </div>
            <button
              onClick={() => handleDelete(s.key, s.filename)}
              className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-1"
              title="Delete session"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
