import { useMemo } from 'react';

export default function EventsPanel({ annotations, autoEvents, onDeleteAnnotation, onZoomToTime }) {
  const allEvents = useMemo(() => {
    const items = [
      ...(annotations || []).map(a => ({ ...a, isAuto: false })),
      ...(autoEvents || []).map(a => ({ ...a, isAuto: true })),
    ];
    items.sort((a, b) => a.time - b.time);
    return items;
  }, [annotations, autoEvents]);

  if (allEvents.length === 0) return null;

  return (
    <div className="p-3 border-t border-gray-200 dark:border-gray-800">
      <h2 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">EVENTS</h2>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {allEvents.map((ev, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] py-1 px-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer group"
            onClick={() => onZoomToTime(ev.time)}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.isAuto ? 'bg-orange-500' : 'bg-white'}`} />
            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
              {new Date(ev.time).toLocaleTimeString()}
            </span>
            <span className="text-gray-200 truncate flex-1">{ev.label}</span>
            {!ev.isAuto && onDeleteAnnotation && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ev.time); }}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
