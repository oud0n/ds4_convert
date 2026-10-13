// Uniform display sampling, always including the first and last points.
// Limits used by callers must be integers >= 2.
export function sampleIndices(length: number, limit: number): number[] {
  const count = Math.min(length, limit);
  if (count <= 1) return count === 1 ? [0] : [];
  return Array.from({ length: count }, (_, i) =>
    Math.floor(i * (length - 1) / (count - 1))
  );
}

export function samplePoints<T>(points: T[], limit: number): T[] {
  return sampleIndices(points.length, limit).map(index => points[index]);
}
