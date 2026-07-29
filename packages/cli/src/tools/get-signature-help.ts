import { getWorkspace } from "../lib/workspace.js";

export async function getSignatureHelp(
  script: string,
  line: number,
  col: number,
) {
  return getWorkspace().getSignatureHelp(script, { line, col });
}
