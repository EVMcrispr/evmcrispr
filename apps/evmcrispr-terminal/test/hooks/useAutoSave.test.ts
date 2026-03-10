import { beforeEach, describe, expect, test } from "bun:test";
import { flushAutoSave } from "../../src/hooks/useAutoSave";
import { terminalStoreActions } from "../../src/stores/terminal-store";
import { createScript, getScript } from "../../src/utils/local-storage";

beforeEach(() => {
  localStorage.clear();
  terminalStoreActions("currentScriptId", null);
  terminalStoreActions("title", "");
  terminalStoreActions("script", "");
});

describe("flushAutoSave", () => {
  test("is a no-op when currentScriptId is null", () => {
    terminalStoreActions("title", "Orphan");
    terminalStoreActions("script", "code");

    flushAutoSave();

    expect(localStorage.getItem("evmcrispr:scripts")).toBeNull();
  });

  test("writes to registry when currentScriptId is set", () => {
    const id = createScript("Initial", "v1");
    terminalStoreActions("currentScriptId", id);
    terminalStoreActions("title", "Updated Title");
    terminalStoreActions("script", "v2 code");

    flushAutoSave();

    const stored = getScript(id);
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("Updated Title");
    expect(stored!.script).toBe("v2 code");
  });

  test("can be called multiple times safely", () => {
    const id = createScript("Test", "code");
    terminalStoreActions("currentScriptId", id);
    terminalStoreActions("title", "Test");
    terminalStoreActions("script", "same code");

    flushAutoSave();
    flushAutoSave();
    flushAutoSave();

    const stored = getScript(id);
    expect(stored!.script).toBe("same code");
  });
});
