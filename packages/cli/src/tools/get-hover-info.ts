import { getWorkspace } from "../lib/workspace.js";

export async function getHoverInfo(script: string, line: number, col: number) {
  const workspace = getWorkspace();
  await workspace.prewarm(script);
  return workspace.getHoverInfo(script, { line, col });
}
