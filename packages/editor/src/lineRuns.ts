/** Sorted 1-based line numbers as [first, last] runs of consecutive
 *  lines, keeping those a text of `count` lines has. */
export function lineRuns(
  lines: readonly number[],
  count: number,
): [number, number][] {
  const runs: [number, number][] = [];
  for (const line of [...lines].sort((a, b) => a - b)) {
    if (line < 1 || line > count) continue;
    const last = runs.at(-1);
    if (last && line <= last[1] + 1) last[1] = line;
    else runs.push([line, line]);
  }
  return runs;
}
