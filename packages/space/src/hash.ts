import { digest } from "lib0/hash/sha256";

/** A revision's id: a hash of its text and its parent's id, so recording
 *  the same state twice (two tabs, later two members) is the same entry. */
export function revisionId(text: string, parent: string | undefined): string {
  const bytes = digest(
    new TextEncoder().encode(JSON.stringify([parent ?? null, text])),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
