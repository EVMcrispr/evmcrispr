import { getWorkspace } from "../lib/workspace.js";

export async function getCompletions(
  script: string,
  line: number,
  col: number,
) {
  return getWorkspace().getCompletions(script, { line, col });
}
