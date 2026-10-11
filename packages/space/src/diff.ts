import { diff3Merge, diffComm } from "node-diff3";

const lines = (text: string) => text.split("\n");

export interface LineStats {
  added: number;
  removed: number;
}

export function lineStats(before: string, after: string): LineStats {
  let added = 0;
  let removed = 0;
  for (const chunk of diffComm(lines(before), lines(after))) {
    if (chunk.common) continue;
    removed += chunk.buffer1.length;
    added += chunk.buffer2.length;
  }
  return { added, removed };
}

export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

export function lineDiff(before: string, after: string): DiffLine[] {
  return diffComm(lines(before), lines(after)).flatMap((chunk): DiffLine[] =>
    chunk.common
      ? chunk.common.map((text) => ({ kind: "same", text }))
      : [
          ...chunk.buffer1.map((text) => ({ kind: "removed" as const, text })),
          ...chunk.buffer2.map((text) => ({ kind: "added" as const, text })),
        ],
  );
}

/** 1-based lines of `after` that are new or changed against `before`. */
export function changedLines(before: string, after: string): number[] {
  const changed: number[] = [];
  let line = 0;
  for (const chunk of diffComm(lines(before), lines(after))) {
    if (chunk.common) {
      line += chunk.common.length;
      continue;
    }
    for (const _ of chunk.buffer2) changed.push(++line);
  }
  return changed;
}

/**
 * Takes one revision's change back out of `current`, keeping what was made
 * after it: a three-way line merge of `current` and `parent` over `revision`.
 * Null when later edits touch the same lines.
 */
export function revertChange(
  current: string,
  revision: string,
  parent: string,
): string | null {
  const merged: string[] = [];
  for (const region of diff3Merge(
    lines(current),
    lines(revision),
    lines(parent),
  )) {
    if (!region.ok) return null;
    merged.push(...region.ok);
  }
  return merged.join("\n");
}
