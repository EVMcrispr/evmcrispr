import { describe, expect, test } from "bun:test";
import {
  buildFileRef,
  dragHasFiles,
  extractPastedImages,
  flattenEntry,
  isFileTooLarge,
  MAX_UPLOAD_BYTES,
} from "../../src/utils/file-upload";

describe("buildFileRef", () => {
  test("wraps the CID in an @ipfs.get call", () => {
    expect(buildFileRef("QmXyz")).toBe('@ipfs.get("QmXyz")');
  });
});

describe("dragHasFiles", () => {
  test("accepts a drag carrying files", () => {
    expect(dragHasFiles({ types: ["Files"] } as unknown as DataTransfer)).toBe(
      true,
    );
    expect(
      dragHasFiles({
        types: ["text/plain", "Files"],
      } as unknown as DataTransfer),
    ).toBe(true);
  });

  test("rejects text-only drags and null", () => {
    expect(
      dragHasFiles({ types: ["text/plain"] } as unknown as DataTransfer),
    ).toBe(false);
    expect(dragHasFiles({ types: [] } as unknown as DataTransfer)).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
  });
});

describe("extractPastedImages", () => {
  const item = (kind: string, type: string, file: File | null) => ({
    kind,
    type,
    getAsFile: () => file,
  });

  test("keeps only image file items", () => {
    const png = new File(["x"], "shot.png", { type: "image/png" });
    const dt = {
      items: [
        item("string", "text/plain", null),
        item("file", "image/png", png),
        item("file", "application/pdf", new File(["y"], "doc.pdf")),
      ],
    } as unknown as DataTransfer;
    expect(extractPastedImages(dt)).toEqual([png]);
  });

  test("drops items whose file is unavailable", () => {
    const dt = {
      items: [item("file", "image/png", null)],
    } as unknown as DataTransfer;
    expect(extractPastedImages(dt)).toEqual([]);
  });

  test("handles a null clipboard", () => {
    expect(extractPastedImages(null)).toEqual([]);
  });
});

describe("flattenEntry", () => {
  const fileEntry = (fullPath: string, file: File): FileSystemFileEntry =>
    ({
      isFile: true,
      isDirectory: false,
      fullPath,
      name: fullPath.split("/").pop(),
      file: (resolve: (f: File) => void) => resolve(file),
    }) as unknown as FileSystemFileEntry;

  const dirEntry = (
    fullPath: string,
    children: FileSystemEntry[],
  ): FileSystemDirectoryEntry => {
    // readEntries drains in batches: return everything once, then [].
    let drained = false;
    return {
      isFile: false,
      isDirectory: true,
      fullPath,
      name: fullPath.split("/").pop(),
      createReader: () => ({
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) => {
          const batch = drained ? [] : children;
          drained = true;
          resolve(batch);
        },
      }),
    } as unknown as FileSystemDirectoryEntry;
  };

  test("collects nested files with root-relative paths", async () => {
    const a = new File(["a"], "a.txt");
    const b = new File(["b"], "b.sol");
    const root = dirEntry("/pkg", [
      fileEntry("/pkg/a.txt", a),
      dirEntry("/pkg/src", [fileEntry("/pkg/src/b.sol", b)]),
    ]);

    const out: { file: File; path: string }[] = [];
    await flattenEntry(root, out);
    expect(out).toEqual([
      { file: a, path: "pkg/a.txt" },
      { file: b, path: "pkg/src/b.sol" },
    ]);
  });

  test("a lone file entry keeps its name as the path", async () => {
    const f = new File(["x"], "x.txt");
    const out: { file: File; path: string }[] = [];
    await flattenEntry(fileEntry("/x.txt", f), out);
    expect(out).toEqual([{ file: f, path: "x.txt" }]);
  });
});

describe("isFileTooLarge", () => {
  test("boundary at MAX_UPLOAD_BYTES", () => {
    expect(isFileTooLarge({ size: MAX_UPLOAD_BYTES })).toBe(false);
    expect(isFileTooLarge({ size: MAX_UPLOAD_BYTES + 1 })).toBe(true);
    expect(isFileTooLarge({ size: 0 })).toBe(false);
  });
});
