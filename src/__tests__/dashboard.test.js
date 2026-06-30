import { describe, it, expect } from 'vitest';
import { parseCSV, validateCSV, parseHWiNFODate } from '../utils/csvParser';
import { sanitizeFilename, sanitizeHeader, parseNumericValue } from '../utils/sanitize';
import { categorizeSensor } from '../utils/sensorCategories';
import { computeStats, isThrottleColumn, detectThrottlingEvents } from '../utils/briefing';

// Test 1: CSV Parser — Header Extraction, Duplicate Disambiguation, and Row Filtering
describe('Test 1: CSV Parser', () => {
  const csv = [
    'Date,Time,"CPU Package [°C]","CPU Package [°C]","Drive Remaining Life [%]","Drive Remaining Life [%]",',
    '30.3.2026,16:32:55.171,49,56,96.0,87.0,',
    '30.3.2026,16:32:57.169,42,43,96.0,87.0,',
    'Date,Time,"CPU Package [°C]","CPU Package [°C]","Drive Remaining Life [%]","Drive Remaining Life [%]",',
    ',,CPU [#0]: Intel Core i9-10900K: DTS,CPU [#0]: Intel Core i9-10900K: DTS,,,',
    '30.3.2026,16:32:59.170,45,48,96.0,87.0,',
  ].join('\n');

  it('parses headers with disambiguated duplicates', () => {
    const { headers } = parseCSV(csv);
    expect(headers).toContain('CPU Package [°C]');
    expect(headers).toContain('CPU Package [°C] (2)');
    expect(headers).toContain('Drive Remaining Life [%]');
    expect(headers).toContain('Drive Remaining Life [%] (2)');
  });

  it('strips trailing empty column from trailing comma', () => {
    const { headers } = parseCSV(csv);
    const last = headers[headers.length - 1];
    expect(last).not.toBe('');
  });

  it('filters out repeated header and hardware description rows', () => {
    const { rows } = parseCSV(csv);
    expect(rows.length).toBe(3);
  });

  it('parses DD.MM.YYYY date correctly', () => {
    const date = parseHWiNFODate('30.3.2026', '16:32:55.171');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(date.getDate()).toBe(30);
  });
});

// Test 2: Filename Sanitization
describe('Test 2: Filename Sanitization', () => {
  it('sanitizes dangerous filenames', () => {
    const result = sanitizeFilename('my<script>alert("xss")</script>file (copy).csv');
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('"');
  });
});

// Test 3: Sensor Categorization
describe('Test 3: Sensor Categorization', () => {
  it('categorizes CPU Package [°C] as Temperatures', () => {
    expect(categorizeSensor('CPU Package [°C]')).toBe('Temperatures');
  });

  it('categorizes GPU Power [W] as Power', () => {
    expect(categorizeSensor('GPU Power [W]')).toBe('Power');
  });

  it('categorizes CPU [RPM] as Fans', () => {
    expect(categorizeSensor('CPU [RPM]')).toBe('Fans');
  });

  it('categorizes CPU Clock [MHz] as Clocks', () => {
    expect(categorizeSensor('CPU Clock [MHz]')).toBe('Clocks');
  });

  it('categorizes Core 0 VID [V] as Voltages', () => {
    expect(categorizeSensor('Core 0 VID [V]')).toBe('Voltages');
  });

  it('categorizes CPU Usage [%] as Usage and Load', () => {
    expect(categorizeSensor('CPU Usage [%]')).toBe('Usage and Load');
  });

  it('categorizes Drive Temperature [°C] as Temperatures (°C priority over Drive)', () => {
    expect(categorizeSensor('Drive Temperature [°C]')).toBe('Temperatures');
  });

  it('categorizes GPU Encoder as GPU', () => {
    expect(categorizeSensor('GPU Encoder')).toBe('GPU');
  });

  it('categorizes GPU Memory Available [MB] as Memory', () => {
    expect(categorizeSensor('GPU Memory Available [MB]')).toBe('Memory');
  });

  it('categorizes GPU Busy (avg) [ms] as Timing', () => {
    expect(categorizeSensor('GPU Busy (avg) [ms]')).toBe('Timing');
  });

  it('excludes Date and Time', () => {
    expect(categorizeSensor('Date')).toBeNull();
    expect(categorizeSensor('Time')).toBeNull();
  });

  it('excludes Yes/No columns', () => {
    expect(categorizeSensor('Performance Limit - Power [Yes/No]')).toBeNull();
  });
});

// Test 4: Peak / Min / Avg Calculations
describe('Test 4: Peak / Min / Avg Calculations', () => {
  it('computes stats for clean array', () => {
    const { min, max, avg } = computeStats([10, 20, 30, 40, 50]);
    expect(min).toBe(10);
    expect(max).toBe(50);
    expect(avg).toBe(30.00);
  });

  it('computes stats ignoring nulls', () => {
    const { min, max, avg } = computeStats([10, null, 30, null, 50]);
    expect(min).toBe(10);
    expect(max).toBe(50);
    expect(avg).toBe(30.00);
  });
});

// Test 5: Throttling Event Detection
describe('Test 5: Throttling Event Detection', () => {
  it('detects transition events correctly', () => {
    const values = ['No', 'No', 'Yes', 'Yes', 'No', 'Yes', 'No'];
    const events = detectThrottlingEvents(values);
    expect(events.length).toBe(2);
    expect(events[0].index).toBe(2);
    expect(events[1].index).toBe(5);
    expect(events[0].sustained).toBe(true);
    expect(events[1].sustained).toBe(false);
  });

  it('does not scan non-throttle columns', () => {
    expect(isThrottleColumn('GPU Performance Limiters (avg) [Yes/No]')).toBe(false);
    expect(isThrottleColumn('Performance Limit - Power [Yes/No]')).toBe(true);
  });
});

// Test 6: HTML Sanitization of Headers
describe('Test 6: HTML Sanitization of Headers', () => {
  it('strips HTML tags from headers', () => {
    expect(sanitizeHeader('<img src=x onerror=alert(1)>CPU Temp [°C]')).toBe('CPU Temp [°C]');
  });

  it('leaves clean headers unchanged', () => {
    expect(sanitizeHeader('Normal Header [W]')).toBe('Normal Header [W]');
  });
});

// Test 7: Invalid CSV Rejection
describe('Test 7: Invalid CSV Rejection', () => {
  it('rejects CSV without Date/Time columns', () => {
    const csv = 'Sensor1,Sensor2,Sensor3\n1,2,3\n';
    const { headers, rows } = parseCSV(csv);
    const result = validateCSV(headers, rows);
    expect(result.valid).toBe(false);
  });

  it('accepts valid CSV with Date, Time, and numeric sensor', () => {
    const csv = 'Date,Time,"CPU Temp [°C]"\n30.3.2026,16:32:55.171,49\n30.3.2026,16:32:57.169,42\n';
    const { headers, rows } = parseCSV(csv);
    const result = validateCSV(headers, rows);
    expect(result.valid).toBe(true);
  });
});

// Test 8: Numeric Parsing with Edge Cases
describe('Test 8: Numeric Parsing with Edge Cases', () => {
  it('parses valid number', () => {
    expect(parseNumericValue('42.5')).toBe(42.5);
  });

  it('returns null for non-numeric string', () => {
    expect(parseNumericValue('not_a_number')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseNumericValue('')).toBeNull();
  });

  it('returns null for Yes', () => {
    expect(parseNumericValue('Yes')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseNumericValue(undefined)).toBeNull();
  });

  it('parses trimmed numeric string', () => {
    expect(parseNumericValue('  67.3  ')).toBe(67.3);
  });
});
