// A whole space as a link, and back. An export is the space's id, its
// script and its timeline records in the share envelope, and nothing
// private to this browser: no marks (the approved text among them), no
// chats, no preferences. The script travels as text, not as the document
// it lives in: a document state from a link could be built against this
// browser's own (its client ids and clocks are in every export), and no
// inspection of it would tell.
//
// Coming back, an export is data from whoever made the link. `readExport`
// is the one door: it checks all of it before any of it is used, and
// refuses the whole export if anything is off. What it returns is applied
// by the space itself, in one step, as someone else's writing
// (`Spaces.restore`, `LiveSpace.mergeCopy`): nothing here writes to a
// space, and nothing an export says approves a script.
import { plainLine } from "@evmcrispr/ai";
import { encryptPayload, type SharePayload } from "@evmcrispr/core";
import { consoleSize, parseConsole } from "@evmcrispr/editor";
import {
  deriveTitle,
  IMPORT_LIMITS,
  MalformedExport,
  normalizeEol,
  parseTimeline,
  toPatch,
} from "@evmcrispr/space";
import type { LiveSpace, SpaceCopy } from "./live-space";
import type { Spaces } from "./spaces";

type SpacePayload = Extract<SharePayload, { kind: "space" }>;

/** An export, checked: the space it is of, and its content. */
export interface SpaceExport extends SpaceCopy {
  id: string;
}

/** Characters of an encrypted export (its ciphertext, in base64) beyond
 *  which it is neither made nor decrypted: about six megabytes. What it
 *  decrypts to is smaller still, so this bounds what is parsed too. */
export const MAX_EXPORT_CHARS = 8_000_000;

/** Everything in the space except what is private to this browser. */
export function snapshotSpace(space: LiveSpace): SpacePayload {
  const script = space.getText();
  return {
    kind: "space",
    id: space.id,
    title: deriveTitle(script),
    script,
    timeline: toPatch(space.timeline.getState()),
  };
}

const SPACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks an export's payload, all of it, and returns what a space can take
 * in. Throws `MalformedExport`, saying why, otherwise:
 *  - its id is a space id (it names the space it goes into, so it is not
 *    left to be a path or a CID);
 *  - its script is text within the limit, with LF line endings;
 *  - its timeline is what `parseTimeline` accepts, with every run's
 *    console checked (`parseConsole`) and short texts held to the rule
 *    for a line shown to people and to a model (`plainLine`).
 * Anything else in the payload is not looked at.
 */
export function readExport(
  payload: SpacePayload,
  cid?: string,
  now = Date.now(),
): SpaceExport {
  if (!SPACE_ID.test(payload.id))
    throw new MalformedExport("its id is not a space's");
  if (payload.script.length > IMPORT_LIMITS.script)
    throw new MalformedExport("its script is too long");
  const timeline = parseTimeline(payload.timeline ?? {}, {
    console: (raw) => parseConsole(raw, "Not followed in this browser"),
    consoleSize,
    plain: plainLine,
    now,
  });
  return {
    id: payload.id.toLowerCase(),
    script: normalizeEol(payload.script),
    timeline,
    ...(cid ? { cid } : {}),
  };
}

export type Exported =
  | { ok: true; url: string }
  /** The space is more than a link can hold: `why` says what. */
  | { ok: false; why: string };

/**
 * Pins an encrypted snapshot of the space and returns its link. Never
 * held back by the review: it is a copy of the space as it is, typing not
 * yet recorded included. A space this version could not open again is not
 * pinned.
 */
export async function exportSpace(
  space: LiveSpace,
  deps: {
    pin(envelope: unknown, name: string): Promise<{ IpfsHash: string }>;
    origin: string;
  },
): Promise<Exported> {
  space.record("user");
  const payload = snapshotSpace(space);
  try {
    readExport(JSON.parse(JSON.stringify(payload)));
  } catch (error) {
    if (error instanceof MalformedExport)
      return { ok: false, why: error.message };
    throw error;
  }
  const { envelope, key } = await encryptPayload(payload);
  if (envelope.data.length > MAX_EXPORT_CHARS)
    return { ok: false, why: "it holds too much for a link" };
  const { IpfsHash } = await deps.pin(envelope, "EVMcrispr - encrypted space");
  // The key stays the last segment of the fragment, as in a share link.
  return { ok: true, url: `${deps.origin}/#/${IpfsHash}#${key}` };
}

export type Restored =
  | { ok: true; id: string }
  /** Asked to restore, but a space of that id is here; asked to merge, but
   *  none is. Nothing was touched: the user is asked again. */
  | { ok: false; reason: "present" | "absent" };

/**
 * What the user chose to do with an export they opened:
 *  - `restore`: bring the space in under its own id, where this browser
 *    has none of that id. It starts approved.
 *  - `merge`: merge it into the space of that id that is here. A foreign
 *    write: if it changes the script, the script is unreviewed.
 *  - `copy`: a new space, under a new id, of the export's script alone.
 * Which of the first two applies is decided here, at the moment of
 * acting, and never by falling from one into the other.
 */
export async function restoreSpace(
  spaces: Spaces,
  exported: SpaceExport,
  mode: "restore" | "merge" | "copy",
): Promise<Restored> {
  const { id, ...copy } = exported;
  if (mode === "copy")
    return {
      ok: true,
      id: await spaces.create({
        text: copy.script,
        source: "import",
        ...(copy.cid ? { origin: { cid: copy.cid } } : {}),
      }),
    };
  if (mode === "restore")
    return (await spaces.restore(id, copy))
      ? { ok: true, id }
      : { ok: false, reason: "present" };
  const space = await spaces.acquire(id);
  if (!space) return { ok: false, reason: "absent" };
  try {
    space.mergeCopy(copy);
  } finally {
    spaces.release(id);
  }
  return { ok: true, id };
}
