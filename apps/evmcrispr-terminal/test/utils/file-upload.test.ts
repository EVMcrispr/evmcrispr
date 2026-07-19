import { describe, expect, test } from "bun:test";
import {
  buildFileRef,
  dragHasFiles,
  extractPastedImages,
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

describe("isFileTooLarge", () => {
  test("boundary at MAX_UPLOAD_BYTES", () => {
    expect(isFileTooLarge({ size: MAX_UPLOAD_BYTES })).toBe(false);
    expect(isFileTooLarge({ size: MAX_UPLOAD_BYTES + 1 })).toBe(true);
    expect(isFileTooLarge({ size: 0 })).toBe(false);
  });
});
