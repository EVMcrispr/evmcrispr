import type * as Y from "yjs";

export const SCHEMA = 1;

export function scriptText(doc: Y.Doc): Y.Text {
  return doc.getText("script");
}

export function docMeta(doc: Y.Doc): Y.Map<number> {
  return doc.getMap<number>("meta");
}

/** CRLF and lone CR become LF: the `Y.Text` only ever holds LF. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** First write of a new space. A document that already has a schema (it
 *  was created in another tab, or restored) is left alone. */
export function initSpaceDoc(
  doc: Y.Doc,
  init: { text: string; createdAt: number },
  origin?: unknown,
): void {
  doc.transact(() => {
    const meta = docMeta(doc);
    if (meta.has("schema")) return;
    meta.set("schema", SCHEMA);
    meta.set("createdAt", init.createdAt);
    scriptText(doc).insert(0, normalizeEol(init.text));
  }, origin);
}

/** Makes `text` read `next` by replacing only the span that differs, in
 *  one transaction tagged `origin`. Returns false when nothing changed. */
export function applyText(
  text: Y.Text,
  next: string,
  origin: unknown,
): boolean {
  const from = text.toString();
  const to = normalizeEol(next);
  if (from === to) return false;
  let start = 0;
  const max = Math.min(from.length, to.length);
  while (start < max && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (
    endFrom > start &&
    endTo > start &&
    from[endFrom - 1] === to[endTo - 1]
  ) {
    endFrom--;
    endTo--;
  }
  const run = () => {
    if (endFrom > start) text.delete(start, endFrom - start);
    if (endTo > start) text.insert(start, to.slice(start, endTo));
  };
  if (text.doc) text.doc.transact(run, origin);
  else run();
  return true;
}

export type EditResult = { ok: true } | { ok: false; error: string };

/** Exact, unique string replacement (the assistant's `edit_script`). */
export function strReplace(
  text: Y.Text,
  oldString: string,
  newString: string,
  origin: unknown,
): EditResult {
  if (oldString === "")
    return {
      ok: false,
      error:
        "old_string must not be empty. Use write_script to replace the whole script.",
    };
  const current = text.toString();
  const needle = normalizeEol(oldString);
  const first = current.indexOf(needle);
  if (first === -1)
    return {
      ok: false,
      error:
        "old_string was not found in the script. It must match the current content exactly, including whitespace. Call get_script to re-read the current content.",
    };
  let matches = 0;
  for (
    let at = first;
    at !== -1;
    at = current.indexOf(needle, at + needle.length)
  )
    matches++;
  if (matches > 1)
    return {
      ok: false,
      error: `old_string matches ${matches} times. Include more surrounding lines so it is unique.`,
    };
  const replacement = normalizeEol(newString);
  const run = () => {
    text.delete(first, needle.length);
    if (replacement) text.insert(first, replacement);
  };
  if (text.doc) text.doc.transact(run, origin);
  else run();
  return { ok: true };
}
