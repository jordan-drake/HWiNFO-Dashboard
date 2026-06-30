export const GRAPH_CATEGORIES = [
  {
    id: 'thermal',
    name: 'Thermal Sensors',
    match: (h) => h.includes('\u00b0C') && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /Core.*Temp|Core Temperatures/i, color: '#FF4444' },
      { match: /CPU Package/i, color: '#CC2222' },
      { match: /GPU.*Hot\s*Spot/i, color: '#E83E3E' },
      { match: /GPU.*Temp/i, color: '#FF6B6B' },
      { match: /VRM/i, color: '#FF8C8C' },
      { match: /PCH/i, color: '#B22222' },
      { match: /Drive/i, color: '#FF7043' },
      { match: /Motherboard|System/i, color: '#D84315' },
    ],
    fallbackColors: ['#FF5252', '#FF1744', '#D50000', '#C62828', '#E53935', '#F44336', '#EF5350', '#E57373',
      '#FFAB91', '#FF8A65', '#FF7043', '#FF5722', '#F4511E', '#E64A19', '#D84315', '#BF360C'],
  },
  {
    id: 'power',
    name: 'Power & Electrical',
    match: (h) => (h.includes('[W]') || h.includes('[V]')) && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /CPU Package Power/i, color: '#2196F3' },
      { match: /GPU Power/i, color: '#1565C0' },
      { match: /IA Cores/i, color: '#42A5F5' },
      { match: /DRAM/i, color: '#90CAF9' },
      { match: /\+12V/i, color: '#0D47A1' },
      { match: /\+5V/i, color: '#1976D2' },
      { match: /\+3\.3V/i, color: '#1E88E5' },
      { match: /Vcore/i, color: '#2962FF' },
    ],
    fallbackColors: ['#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1', '#82B1FF',
      '#448AFF', '#2979FF', '#2962FF', '#BBDEFB', '#90CAF9', '#64B5F6'],
  },
  {
    id: 'usage',
    name: 'Usage & Load',
    match: (h) => h.includes('[%]') && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /Total CPU Usage|CPU Usage/i, color: '#4CAF50' },
      { match: /GPU Core Load/i, color: '#2E7D32' },
      { match: /GPU Memory/i, color: '#81C784' },
      { match: /Disk/i, color: '#A5D6A7' },
      { match: /CPU.*Core.*Usage/i, color: '#43A047' },
    ],
    fallbackColors: ['#66BB6A', '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20', '#A5D6A7', '#81C784',
      '#69F0AE', '#00E676', '#00C853', '#C8E6C9', '#B9F6CA'],
  },
  {
    id: 'fan',
    name: 'Fan Speeds',
    match: (h) => h.includes('RPM') && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /CPU/i, color: '#9C27B0' },
      { match: /GPU/i, color: '#7B1FA2' },
      { match: /Chassis|Case|System/i, color: '#CE93D8' },
    ],
    fallbackColors: ['#AB47BC', '#8E24AA', '#6A1B9A', '#4A148C', '#BA68C8', '#CE93D8', '#E1BEE7', '#EA80FC'],
  },
  {
    id: 'clock',
    name: 'Clocks & Frequency',
    match: (h) => h.includes('MHz') && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /Memory Clock/i, color: '#FFC107' },
      { match: /GPU Effective/i, color: '#FFB74D' },
      { match: /GPU Clock/i, color: '#FF9800' },
      { match: /CPU.*Clock|Core.*Clock/i, color: '#FFD54F' },
    ],
    fallbackColors: ['#FFA726', '#FF9800', '#FB8C00', '#F57C00', '#EF6C00', '#E65100', '#FFE082', '#FFD54F',
      '#FFCA28', '#FFC107', '#FFB300', '#FFA000'],
  },
  {
    id: 'throughput',
    name: 'Memory & Throughput',
    match: (h) => (h.includes('[MB]') || h.includes('[MB/s]') || h.includes('[KB/s]') || h.includes('[GT/s]') || h.includes('[ms]') || h.includes('[x]')) && !h.includes('[Yes/No]'),
    sensorColors: [
      { match: /Download/i, color: '#00BCD4' },
      { match: /Upload/i, color: '#009688' },
    ],
    fallbackColors: ['#4DD0E1', '#26C6DA', '#00BCD4', '#00ACC1', '#0097A7', '#00838F', '#006064',
      '#26A69A', '#009688', '#00897B', '#00796B', '#80CBC4', '#B2DFDB'],
  },
];

export function categorizeSensorsForGraphs(headers) {
  const assigned = new Set();
  const result = {};

  for (const cat of GRAPH_CATEGORIES) {
    const sensors = [];
    const usedColors = new Set();
    let fallbackIdx = 0;

    for (const header of headers) {
      if (header === 'Date' || header === 'Time') continue;
      if (header.includes('[Yes/No]')) continue;
      if (assigned.has(header)) continue;
      if (!cat.match(header)) continue;

      assigned.add(header);

      let color = null;
      for (const sc of cat.sensorColors) {
        if (sc.match.test(header) && !usedColors.has(sc.color)) {
          color = sc.color;
          usedColors.add(color);
          break;
        }
      }
      if (!color) {
        while (usedColors.has(cat.fallbackColors[fallbackIdx % cat.fallbackColors.length]) && fallbackIdx < cat.fallbackColors.length * 2) {
          fallbackIdx++;
        }
        color = cat.fallbackColors[fallbackIdx % cat.fallbackColors.length];
        usedColors.add(color);
        fallbackIdx++;
      }

      sensors.push({ header, color });
    }

    if (sensors.length > 0) {
      result[cat.id] = { name: cat.name, sensors };
    }
  }

  const otherColors = ['#78909C', '#546E7A', '#607D8B', '#90A4AE', '#455A64', '#B0BEC5', '#37474F', '#CFD8DC'];
  const otherSensors = [];
  let otherIdx = 0;
  for (const header of headers) {
    if (header === 'Date' || header === 'Time') continue;
    if (header.includes('[Yes/No]')) continue;
    if (assigned.has(header)) continue;
    otherSensors.push({ header, color: otherColors[otherIdx % otherColors.length] });
    otherIdx++;
  }
  if (otherSensors.length > 0) {
    result.other = { name: 'Other', sensors: otherSensors };
  }

  return result;
}
