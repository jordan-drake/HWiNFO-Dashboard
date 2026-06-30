export function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function sanitizeHeader(header) {
  return String(header).replace(/<[^>]*>/g, '').trim();
}

export function parseNumericValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (str === '' || str === 'Yes' || str === 'No') return null;
  const num = parseFloat(str);
  if (isNaN(num)) {
    console.warn(`Non-numeric value encountered: "${str}"`);
    return null;
  }
  return num;
}
