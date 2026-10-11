const COMMENT = /^\s*#+\s*(.*?)\s*$/;

/** 0-based index of the first non-blank line when it is a comment. */
export function titleLine(text: string): number | null {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.trim() !== "");
  if (index === -1) return null;
  const match = COMMENT.exec(lines[index]);
  return match && match[1] !== "" ? index : null;
}

/** The space's title: its script's first non-blank line when that line is
 *  a comment, without the leading `#`s. "" when the script starts with code. */
export function deriveTitle(text: string): string {
  const index = titleLine(text);
  if (index === null) return "";
  return COMMENT.exec(text.split("\n")[index])?.[1] ?? "";
}

const UNTITLED_PREVIEW = 40;

/** What lists show: the title, or "Untitled" and the start of the script. */
export function displayTitle(text: string): string {
  const title = deriveTitle(text);
  if (title) return title;
  const first = text
    .split("\n")
    .find((line) => line.trim() !== "")
    ?.trim();
  if (!first) return "Untitled";
  return `Untitled · ${
    first.length > UNTITLED_PREVIEW
      ? `${first.slice(0, UNTITLED_PREVIEW - 1)}…`
      : first
  }`;
}

/** Inserts `# <title>` as the first line unless the script already starts
 *  with that comment. Used for old shares, inline links and migration. */
export function withTitle(title: string, script: string): string {
  const wanted = title.trim().replace(/\s+/g, " ");
  if (!wanted || deriveTitle(script) === wanted) return script;
  return `# ${wanted}\n${script}`;
}
