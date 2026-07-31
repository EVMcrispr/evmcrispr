import { beforeEach, describe, expect, test } from "bun:test";

import {
  terminalStoreActions,
  terminalStoreGet,
} from "../../src/stores/terminal-store";
import { getEditLog } from "../../src/utils/local-storage";
import {
  applyAiStrReplace,
  applyStrReplaceInStore,
  replaceScriptInStore,
  undoScriptRevision,
} from "../../src/utils/script-edits";

beforeEach(() => {
  localStorage.clear();
  terminalStoreActions("currentScriptId", "script-1");
  terminalStoreActions("title", "Mobile draft");
  terminalStoreActions("script", "switch mainnet\nprint 1\n");
});

describe("store-backed AI script edits", () => {
  test("applies a unique replacement without mounting Monaco", () => {
    const result = applyStrReplaceInStore("print 1", "print 2");

    expect(result.ok).toBe(true);
    expect(terminalStoreGet("script")).toBe("switch mainnet\nprint 2\n");
  });

  test("rejects missing and ambiguous replacements", () => {
    expect(applyStrReplaceInStore("missing", "next")).toEqual({
      ok: false,
      error:
        "old_string was not found in the script. It must match the current content exactly, including whitespace. Call get_script to re-read the current content.",
    });

    terminalStoreActions("script", "print 1\nprint 1");
    const ambiguous = applyStrReplaceInStore("print 1", "print 2");
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.error).toContain("matches 2 times");
  });

  test("undoes the latest AI revision", () => {
    const result = replaceScriptInStore("switch gnosis\nprint 3");
    expect(result.ok).toBe(true);
    if (!result.ok || !result.revisionId) throw new Error("missing revisionId");

    expect(undoScriptRevision(result.revisionId).ok).toBe(true);
    expect(terminalStoreGet("script")).toBe("switch mainnet\nprint 1\n");
  });

  test("records an undoable ai-chat revision in the edit log", () => {
    const result = applyStrReplaceInStore("print 1", "print 2");
    expect(result.ok).toBe(true);

    const log = getEditLog("script-1");
    expect(log?.ops).toHaveLength(1);
    const op = log!.ops[0];
    expect(op.source).toBe("ai-chat");
    expect(op.revisionId).toBeDefined();
    expect(op.revisionBefore).toBe("switch mainnet\nprint 1\n");
    expect(op.revisionAfter).toBe("switch mainnet\nprint 2\n");
  });

  test("undo pops the op so a replay reproduces the reverted script", () => {
    const result = replaceScriptInStore("print 9");
    expect(result.ok).toBe(true);
    if (!result.ok || !result.revisionId) throw new Error("missing revisionId");

    expect(undoScriptRevision(result.revisionId).ok).toBe(true);
    expect(getEditLog("script-1")?.ops).toHaveLength(0);
  });

  test("applyAiStrReplace falls back to the store path without Monaco", () => {
    const result = applyAiStrReplace("print 1", "print 5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revisionId).toBeDefined();
    expect(terminalStoreGet("script")).toBe("switch mainnet\nprint 5\n");
  });

  test("does not undo a revision after a newer change", () => {
    const first = replaceScriptInStore("print 2");
    expect(first.ok).toBe(true);
    replaceScriptInStore("print 3");
    if (!first.ok || !first.revisionId) throw new Error("missing revisionId");

    const result = undoScriptRevision(first.revisionId);
    expect(result.ok).toBe(false);
    expect(terminalStoreGet("script")).toBe("print 3");
  });
});
