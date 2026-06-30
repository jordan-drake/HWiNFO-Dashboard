import { useState, useMemo } from 'react';
import { categorizeSensors } from '../utils/sensorCategories';

const CHART_MODES = [
  { value: 'separate', label: 'Separate' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'compare', label: 'Compare' },
];

export default function SensorSelector({ headers, selectedSensors, onSelectedChange, chartMode, onChartModeChange }) {
  const [expandedCategories, setExpandedCategories] = useState({});

  const categories = useMemo(() => categorizeSensors(headers), [headers]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleSensor = (sensor) => {
    onSelectedChange(prev =>
      prev.includes(sensor) ? prev.filter(s => s !== sensor) : [...prev, sensor]
    );
  };

  const categoryOrder = [
    'Temperatures', 'Power', 'Clocks', 'Fans', 'Voltages',
    'Usage and Load', 'Memory', 'Timing', 'Drive', 'GPU', 'Other'
  ];

  return (
    <div className="flex-1 overflow-auto p-3">
      <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">Sensor Selector</h2>

      {/* Chart mode selector */}
      <div className="flex gap-1 mb-3">
        {CHART_MODES.map(mode => (
          <button
            key={mode.value}
            onClick={() => onChartModeChange(mode.value)}
            className={`flex-1 text-xs py-1 px-2 rounded font-medium ${
              chartMode === mode.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {categoryOrder.map(cat => {
        const sensors = categories[cat];
        if (!sensors || sensors.length === 0) return null;
        const isExpanded = expandedCategories[cat];
        return (
          <div key={cat} className="mb-1">
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full text-left text-xs font-medium px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-between"
            >
              <span>{cat} ({sensors.length})</span>
              <span className="text-gray-400 dark:text-gray-500">{isExpanded ? '-' : '+'}</span>
            </button>
            {isExpanded && (
              <div className="pl-2 space-y-0.5">
                {sensors.map(sensor => (
                  <label key={sensor} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-800/50 px-2 rounded">
                    <input
                      type="checkbox"
                      checked={selectedSensors.includes(sensor)}
                      onChange={() => toggleSensor(sensor)}
                      className="accent-blue-500"
                    />
                    <span className="truncate">{sensor}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
