import { toast } from "@repo/ui";
import type { editor, IPosition } from "monaco-editor";

import pinDirectory from "../api/pinata/pin-directory";
import pinFile from "../api/pinata/pin-file";

/** Files larger than this are rejected instead of pinned. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** One dropped/pasted thing to pin: a lone file or a whole folder. */
export type UploadItem =
  | { kind: "file"; file: File }
  | { kind: "directory"; name: string; files: { file: File; path: string }[] };

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

/**
 * Resolve a drop's `DataTransfer` into upload items, traversing dropped
 * folders into their contained files. Must be called synchronously from
 * the drop handler: the items snapshot happens before the first `await`,
 * after which the browser invalidates the `DataTransfer`.
 */
export function collectDroppedUploads(
  dt: DataTransfer | null,
): Promise<UploadItem[]> {
  if (!dt) return Promise.resolve([]);
  // Synchronous snapshot — entries/files are unreadable after a yield.
  const snapshot = Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => ({
      entry: item.webkitGetAsEntry(),
      file: item.getAsFile(),
    }));

  return (async () => {
    const uploads: UploadItem[] = [];
    for (const { entry, file } of snapshot) {
      if (entry?.isDirectory) {
        const files: { file: File; path: string }[] = [];
        await flattenEntry(entry, files);
        uploads.push({ kind: "directory", name: entry.name, files });
      } else if (entry?.isFile) {
        uploads.push({
          kind: "file",
          file: await entryFile(entry as FileSystemFileEntry),
        });
      } else if (file) {
        uploads.push({ kind: "file", file });
      }
    }
    return uploads;
  })();
}

/** Depth-first traversal of a dropped file-system entry. */
export async function flattenEntry(
  entry: FileSystemEntry,
  out: { file: File; path: string }[],
): Promise<void> {
  if (entry.isFile) {
    out.push({
      file: await entryFile(entry as FileSystemFileEntry),
      // fullPath is "/<root folder>/…"; Pinata wants it without the
      // leading slash so the folder name becomes the directory root.
      path: entry.fullPath.replace(/^\//, ""),
    });
    return;
  }
  if (entry.isDirectory) {
    for (const child of await readAllEntries(
      entry as FileSystemDirectoryEntry,
    )) {
      await flattenEntry(child, out);
    }
  }
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Drain a directory reader — each read returns at most ~100 entries. */
function readAllEntries(
  dir: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readBatch = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(entries);
        entries.push(...batch);
        readBatch();
      }, reject);
    readBatch();
  });
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
 * Pin the given uploads to IPFS and insert `@ipfs.get("<cid>")` calls at
 * `position` — one CID per item; a folder pins as a single directory CID.
 * The position is tracked with a sticky decoration while the uploads run,
 * so edits elsewhere don't misplace the insertion. Items are uploaded
 * sequentially with a progress toast; on a mid-batch failure the
 * already-uploaded CIDs are still inserted. The insertion is undoable as a
 * single step.
 */
export async function uploadAt(
  items: UploadItem[],
  position: IPosition,
  ed: editor.IStandaloneCodeEditor,
): Promise<void> {
  if (items.length === 0) return;

  if (!import.meta.env.VITE_PINATA_JWT) {
    toast.error("IPFS uploads are not configured (missing Pinata JWT)");
    return;
  }

  const model = ed.getModel();
  if (!model) return;

  const accepted: UploadItem[] = [];
  for (const item of items) {
    if (item.kind === "file" && isFileTooLarge(item.file)) {
      toast.error(
        `"${item.file.name}" exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit`,
      );
    } else if (
      item.kind === "directory" &&
      item.files.some(({ file }) => isFileTooLarge(file))
    ) {
      toast.error(
        `"${item.name}" contains a file exceeding the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit`,
      );
    } else if (item.kind === "directory" && item.files.length === 0) {
      toast.error(`"${item.name}" is empty`);
    } else {
      accepted.push(item);
    }
  }
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
  let failed: UploadItem | null = null;

  try {
    for (const [i, item] of accepted.entries()) {
      toast.loading(uploadLabel(accepted, i), { id: toastId });
      try {
        const { IpfsHash } =
          item.kind === "file"
            ? await pinFile(item.file)
            : await pinDirectory(item.files);
        cids.push(IpfsHash);
      } catch (_e) {
        failed = item;
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
      toast.error(`"${itemName(failed)}" could not be pinned to IPFS`, {
        id: toastId,
      });
    } else {
      toast.success(
        cids.length === 1
          ? "Pinned 1 item to IPFS"
          : `Pinned ${cids.length} items to IPFS`,
        { id: toastId },
      );
    }
  } finally {
    if (!model.isDisposed()) model.deltaDecorations([decorationId], []);
  }
}

function itemName(item: UploadItem): string {
  return item.kind === "file" ? item.file.name || "file" : `${item.name}/`;
}

function uploadLabel(items: UploadItem[], index: number): string {
  const name = itemName(items[index]);
  return items.length === 1
    ? `Uploading ${name} to IPFS…`
    : `Uploading ${name} (${index + 1}/${items.length}) to IPFS…`;
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
    void uploadAt(
      images.map((file) => ({ kind: "file", file })),
      position,
      ed,
    );
  };

  node.addEventListener("paste", onPaste, { capture: true });
  ed.onDidDispose(() => {
    node.removeEventListener("paste", onPaste, { capture: true });
  });
}
