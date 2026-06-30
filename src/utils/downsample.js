/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm.
 * Reduces a dataset to `threshold` points while preserving visual shape.
 * Each data point must have { x, y } where x is a timestamp (number) and y is numeric.
 */
export function downsampleLTTB(data, threshold) {
  if (!data || data.length <= threshold || threshold < 3) return data;

  const sampled = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always keep the first point
  sampled.push(data[0]);
  let prevIndex = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Calculate the average point of the next bucket (for triangle area)
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd && j < data.length; j++) {
      if (data[j].y !== null) {
        avgX += data[j].x;
        avgY += data[j].y;
        avgCount++;
      }
    }
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    // Find the point in the current bucket that creates the largest triangle
    let maxArea = -1;
    let maxIndex = bucketStart;
    const prevPoint = data[prevIndex];

    for (let j = bucketStart; j < bucketEnd && j < data.length; j++) {
      if (data[j].y === null) continue;
      const area = Math.abs(
        (prevPoint.x - avgX) * (data[j].y - prevPoint.y) -
        (prevPoint.x - data[j].x) * (avgY - prevPoint.y)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    prevIndex = maxIndex;
  }

  // Always keep the last point
  sampled.push(data[data.length - 1]);
  return sampled;
}

const DEFAULT_MAX_POINTS = 2000;

/**
 * Apply LTTB downsampling to a Chart.js dataset's data array if it exceeds maxPoints.
 */
export function downsampleDataset(points, maxPoints = DEFAULT_MAX_POINTS) {
  if (points.length <= maxPoints) return points;
  return downsampleLTTB(points, maxPoints);
}
