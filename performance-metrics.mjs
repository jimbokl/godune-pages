// Core Web Vitals CLS: largest window with <1s gaps and <5s total duration.
export function createCLSAccumulator() {
  let first = 0, last = -Infinity, current = 0, maximum = 0;
  return entry => {
    if (entry.hadRecentInput || !Number.isFinite(entry.startTime) || !Number.isFinite(entry.value)) return maximum;
    if (entry.startTime - last >= 1000 || entry.startTime - first >= 5000) {
      first = entry.startTime;
      current = 0;
    }
    last = entry.startTime;
    current += entry.value;
    maximum = Math.max(maximum, current);
    return maximum;
  };
}
