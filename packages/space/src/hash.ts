import { digest } from "lib0/hash/sha256";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** A fixed-size stand-in for a text, to remember it without keeping it. */
export function textHash(text: string): string {
  return hex(digest(new TextEncoder().encode(text)));
}

/** A revision's id: a hash of its text and its parent's id, so recording
 *  the same state twice (two tabs, later two members) is the same entry. */
export function revisionId(text: string, parent: string | undefined): string {
  return hex(
    digest(new TextEncoder().encode(JSON.stringify([parent ?? null, text]))),
  );
}
