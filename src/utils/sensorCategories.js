const CATEGORIES = [
  { name: 'Temperatures', test: (h) => h.includes('°C') },
  { name: 'Power', test: (h) => h.includes('[W]') },
  { name: 'Clocks', test: (h) => h.includes('MHz') },
  { name: 'Fans', test: (h) => h.includes('RPM') },
  { name: 'Voltages', test: (h) => h.includes('[V]') },
  { name: 'Usage and Load', test: (h) => h.includes('[%]') },
  { name: 'Memory', test: (h) => h.includes('[MB]') || h.includes('[MB/s]') || h.includes('[KB/s]') },
  { name: 'Timing', test: (h) => h.includes('[ms]') || h.includes('[GT/s]') || h.includes('[x]') },
  { name: 'Drive', test: (h) => h.toLowerCase().includes('drive') },
  { name: 'GPU', test: (h) => h.startsWith('GPU') },
];

export function categorizeSensor(header) {
  if (header === 'Date' || header === 'Time') return null;
  if (header.includes('[Yes/No]')) return null;

  for (const cat of CATEGORIES) {
    if (cat.test(header)) return cat.name;
  }
  return 'Other';
}

export function categorizeSensors(headers) {
  const categories = {};
  for (const header of headers) {
    const cat = categorizeSensor(header);
    if (cat === null) continue;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(header);
  }
  return categories;
}
