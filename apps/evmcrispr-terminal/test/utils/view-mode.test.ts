import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveInitialViewMode } from "../../src/utils/view-mode";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  window.location.hash = "";
});

describe("resolveInitialViewMode", () => {
  test("reads ?mode=view from the hash", () => {
    window.location.hash = `#/${CID}?mode=view`;
    expect(resolveInitialViewMode()).toBe("view");
  });

  test("ignores a trailing decryption key after the query", () => {
    window.location.hash = `#/${CID}?mode=view#Zm9vYmFyLWtleQ`;
    expect(resolveInitialViewMode()).toBe("view");
  });

  test("falls through when the hash has a key but no query", () => {
    window.location.hash = `#/${CID}#Zm9vYmFyLWtleQ`;
    localStorage.setItem("evmcrispr:viewMode", "view");
    expect(resolveInitialViewMode()).toBe("view");
  });
});
