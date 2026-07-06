import { toast } from "@repo/ui";
import type { editor } from "monaco-editor";

import pinText from "../api/pinata/pin-text";

/** Pasted hex strings larger than this are offloaded to IPFS. */
export const HEX_OFFLOAD_THRESHOLD_BYTES = 64;

/**
 * Whether a pasted string is a hex blob worth offloading: a bare, even-length
 * `0x…` literal encoding more than `HEX_OFFLOAD_THRESHOLD_BYTES` bytes.
 */
export function isOffloadableHex(text: string): boolean {
  const hex = text.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) return false;
  const nibbles = hex.length - 2;
  return nibbles % 2 === 0 && nibbles / 2 > HEX_OFFLOAD_THRESHOLD_BYTES;
}

/** The helper call inserted in place of an offloaded hex string. */
export function buildIpfsGetCall(cid: string): string {
  return `@ipfs.get("${cid}")`;
}

// monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges — numeric
// literal because monaco is CDN-loaded and must not be imported at runtime.
const NEVER_GROWS_WHEN_TYPING_AT_EDGES = 1;

// Pasting with Ctrl+Shift+V (Cmd+Shift+V on Mac) keeps the raw hex: the keydown
// arms a short-lived bypass consumed by the paste event that follows it.
const BYPASS_WINDOW_MS = 1000;
let bypassArmedAt = 0;

/**
 * Watch for the paste-as-plain-text shortcut so `offloadPastedHex` can let
 * that paste through untouched.
 */
export function trackOffloadBypassKeys(ed: editor.IStandaloneCodeEditor): void {
  ed.onKeyDown((e) => {
    const b = e.browserEvent;
    if (
      b.key?.toLowerCase() === "v" &&
      b.shiftKey &&
      (b.ctrlKey || b.metaKey)
    ) {
      bypassArmedAt = Date.now();
    }
  });
}

/**
 * If the paste is a large hex blob, pin it to IPFS and replace it with an
 * `@ipfs.get("<cid>")` call. The pasted range is tracked with a sticky
 * decoration while the upload runs, so edits elsewhere don't misplace the
 * replacement; if the pasted text itself changed meanwhile, the replacement
 * is abandoned. The edit is undoable as a single step (Ctrl+Z restores the
 * raw hex), and pasting via Ctrl+Shift+V / Cmd+Shift+V skips the offload entirely
 * (see `trackOffloadBypassKeys`).
 */
export async function offloadPastedHex(
  event: editor.IPasteEvent,
  ed: editor.IStandaloneCodeEditor,
): Promise<void> {
  const bypassed = Date.now() - bypassArmedAt < BYPASS_WINDOW_MS;
  bypassArmedAt = 0;
  if (bypassed) return;

  if (!import.meta.env.VITE_PINATA_JWT) return;

  const model = ed.getModel();
  if (!model) return;

  const pasted = model.getValueInRange(event.range);
  if (!isOffloadableHex(pasted)) return;

  const [decorationId] = model.deltaDecorations(
    [],
    [
      {
        range: event.range,
        options: { stickiness: NEVER_GROWS_WHEN_TYPING_AT_EDGES },
      },
    ],
  );

  try {
    const hex = pasted.trim();
    const { IpfsHash } = await pinText(hex);

    if (model.isDisposed()) return;
    const range = model.getDecorationRange(decorationId);
    if (!range || model.getValueInRange(range) !== pasted) {
      toast.error("The pasted hex changed before it could be pinned to IPFS");
      return;
    }

    model.pushStackElement();
    ed.executeEdits("hex-offload", [
      { range, text: buildIpfsGetCall(IpfsHash) },
    ]);
    model.pushStackElement();

    const bytes = (hex.length - 2) / 2;
    toast.success(`Pinned ${bytes} bytes of hex to IPFS`);
  } catch (_e) {
    toast.error("The pasted hex could not be pinned to IPFS");
  } finally {
    if (!model.isDisposed()) model.deltaDecorations([decorationId], []);
  }
}
