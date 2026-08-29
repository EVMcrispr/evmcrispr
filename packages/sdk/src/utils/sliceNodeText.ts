import type { Node } from "../types";

/** Slice a node's exact source text out of the script's lines using its
 *  `loc` (line/col based, absolute over the whole script). */
export function sliceNodeText(
  scriptLines: string[],
  node: Node,
): string | undefined {
  const loc = node.loc;
  if (!loc) return undefined;
  const { start, end } = loc;
  if (start.line === end.line) {
    return scriptLines[start.line - 1]?.slice(start.col, end.col);
  }
  const parts: string[] = [];
  parts.push(scriptLines[start.line - 1]?.slice(start.col) ?? "");
  for (let l = start.line + 1; l < end.line; l++) {
    parts.push(scriptLines[l - 1] ?? "");
  }
  parts.push(scriptLines[end.line - 1]?.slice(0, end.col) ?? "");
  return parts.join("\n");
}
