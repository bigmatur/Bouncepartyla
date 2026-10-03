export type Interval = {
  startMs: number;
  endMs: number;
};

export function intervalMinutes(intervals: Interval[]) {
  return Math.max(
    0,
    Math.round(
      intervals.reduce((total, interval) => {
        return total + Math.max(0, interval.endMs - interval.startMs);
      }, 0) / 60000,
    ),
  );
}

export function mergeIntervals(input: Interval[]) {
  const sorted = input
    .filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs > item.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) {
    return [] as Interval[];
  }

  const merged: Interval[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

export function intersectIntervals(base: Interval[], mask: Interval[]) {
  const left = mergeIntervals(base);
  const right = mergeIntervals(mask);
  const output: Interval[] = [];

  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const a = left[i];
    const b = right[j];

    const start = Math.max(a.startMs, b.startMs);
    const end = Math.min(a.endMs, b.endMs);

    if (end > start) {
      output.push({ startMs: start, endMs: end });
    }

    if (a.endMs < b.endMs) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return output;
}

export function subtractIntervals(base: Interval[], subtraction: Interval[]) {
  const source = mergeIntervals(base);
  const remove = mergeIntervals(subtraction);

  if (source.length === 0 || remove.length === 0) {
    return source;
  }

  const output: Interval[] = [];

  for (const sourceInterval of source) {
    let cursor = sourceInterval.startMs;

    for (const removeInterval of remove) {
      if (removeInterval.endMs <= cursor) {
        continue;
      }

      if (removeInterval.startMs >= sourceInterval.endMs) {
        break;
      }

      if (removeInterval.startMs > cursor) {
        output.push({
          startMs: cursor,
          endMs: Math.min(removeInterval.startMs, sourceInterval.endMs),
        });
      }

      cursor = Math.max(cursor, removeInterval.endMs);

      if (cursor >= sourceInterval.endMs) {
        break;
      }
    }

    if (cursor < sourceInterval.endMs) {
      output.push({
        startMs: cursor,
        endMs: sourceInterval.endMs,
      });
    }
  }

  return mergeIntervals(output);
}
