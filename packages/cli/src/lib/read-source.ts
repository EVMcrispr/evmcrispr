import { readFile } from "node:fs/promises";

/** Await stdin EOF so streamed input cannot be mistaken for an empty script. */
export async function readScriptSource(file: string): Promise<string> {
  if (file !== "-") return readFile(file, "utf8");
  return readStdin();
}

export async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let source = "";
  for await (const chunk of process.stdin) source += chunk;
  return source;
}
