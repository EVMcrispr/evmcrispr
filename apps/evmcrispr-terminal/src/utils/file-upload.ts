import { toast } from "@repo/ui";
import type { editor, IPosition } from "monaco-editor";

import pinFile from "../api/pinata/pin-file";

/** Files larger than this are rejected instead of pinned. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The helper call inserted for an uploaded file's CID. */
export function buildFileRef(cid: string): string {
  return `@ipfs.get("${cid}")`;
}

/**
 * Whether a drag carries OS files (as opposed to e.g. Monaco's internal
 * dragging of selected text, which uses `text/plain`).
 */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes("Files");
}

export function extractDroppedFiles(dt: DataTransfer | null): File[] {
  return dt ? Array.from(dt.files) : [];
}

/** Image files carried by a clipboard paste (screenshots, copied images). */
export function extractPastedImages(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

export function isFileTooLarge(file: { size: number }): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}

// monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges — numeric
// literal because monaco is CDN-loaded and must not be imported at runtime.
const NEVER_GROWS_WHEN_TYPING_AT_EDGES = 1;

/**
 * Pin the given files to IPFS and insert `@ipfs.get("<cid>")` calls at
 * `position`. The position is tracked with a sticky decoration while the
 * uploads run, so edits elsewhere don't misplace the insertion. Files are
 * uploaded sequentially with a progress toast; on a mid-batch failure the
 * already-uploaded CIDs are still inserted. The insertion is undoable as a
 * single step.
 */
export async function uploadFilesAt(
  files: File[],
  position: IPosition,
  ed: editor.IStandaloneCodeEditor,
): Promise<void> {
  if (files.length === 0) return;

  if (!import.meta.env.VITE_PINATA_JWT) {
    toast.error("IPFS uploads are not configured (missing Pinata JWT)");
    return;
  }

  const model = ed.getModel();
  if (!model) return;

  for (const file of files.filter(isFileTooLarge)) {
    toast.error(
      `"${file.name}" exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit`,
    );
  }
  const accepted = files.filter((f) => !isFileTooLarge(f));
  if (accepted.length === 0) return;

  const [decorationId] = model.deltaDecorations(
    [],
    [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        options: { stickiness: NEVER_GROWS_WHEN_TYPING_AT_EDGES },
      },
    ],
  );

  const toastId = toast.loading(uploadLabel(accepted, 0));
  const cids: string[] = [];
  let failed: File | null = null;

  try {
    for (const [i, file] of accepted.entries()) {
      toast.loading(uploadLabel(accepted, i), { id: toastId });
      try {
        const { IpfsHash } = await pinFile(file);
        cids.push(IpfsHash);
      } catch (_e) {
        failed = file;
        break;
      }
    }

    if (model.isDisposed()) {
      toast.error("The editor changed before the upload finished", {
        id: toastId,
      });
      return;
    }

    if (cids.length > 0) {
      const range = model.getDecorationRange(decorationId);
      if (!range) {
        toast.error("The drop position was lost before the upload finished", {
          id: toastId,
        });
        return;
      }

      model.pushStackElement();
      ed.executeEdits("file-upload", [
        {
          range: {
            startLineNumber: range.endLineNumber,
            startColumn: range.endColumn,
            endLineNumber: range.endLineNumber,
            endColumn: range.endColumn,
          },
          text: cids.map(buildFileRef).join(" "),
        },
      ]);
      model.pushStackElement();
    }

    if (failed) {
      toast.error(`"${failed.name}" could not be pinned to IPFS`, {
        id: toastId,
      });
    } else {
      toast.success(
        cids.length === 1
          ? "Pinned 1 file to IPFS"
          : `Pinned ${cids.length} files to IPFS`,
        { id: toastId },
      );
    }
  } finally {
    if (!model.isDisposed()) model.deltaDecorations([decorationId], []);
  }
}

function uploadLabel(files: File[], index: number): string {
  const name = files[index].name || "file";
  return files.length === 1
    ? `Uploading ${name} to IPFS…`
    : `Uploading ${name} (${index + 1}/${files.length}) to IPFS…`;
}

/**
 * Intercept image pastes at the DOM level (Monaco's `onDidPaste` never sees
 * binary clipboard data) and upload them to IPFS at the cursor position.
 * Text pastes are left for Monaco — and the hex offload — to handle.
 */
export function interceptImagePaste(ed: editor.IStandaloneCodeEditor): void {
  const node = ed.getContainerDomNode();

  const onPaste = (e: ClipboardEvent) => {
    const images = extractPastedImages(e.clipboardData);
    if (images.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const position = ed.getPosition() ?? { lineNumber: 1, column: 1 };
    void uploadFilesAt(images, position, ed);
  };

  node.addEventListener("paste", onPaste, { capture: true });
  ed.onDidDispose(() => {
    node.removeEventListener("paste", onPaste, { capture: true });
  });
}
