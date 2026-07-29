import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearEditLog,
  createScript,
  getAllScripts,
  getEditLog,
  getLastViewedScript,
  getOrCreatePristineScript,
  getScript,
  removeScript,
  saveEditLog,
  saveScript,
  setLastViewedScript,
  slug,
} from "../../src/utils/local-storage";

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

describe("slug", () => {
  test("lowercases and replaces spaces with dashes", () => {
    expect(slug("Hello World")).toBe("hello-world");
  });

  test("strips special characters", () => {
    expect(slug("My Script! (v2)")).toBe("my-script-v2");
  });

  test("returns empty string for empty input", () => {
    expect(slug("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// createScript / getScript
// ---------------------------------------------------------------------------

describe("createScript", () => {
  test("returns a UUID string", () => {
    const id = createScript("Test", "code");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("persists and is retrievable via getScript", () => {
    const id = createScript("My Script", "load aragonos");
    const stored = getScript(id);
    expect(stored).toBeDefined();
    expect(stored!.id).toBe(id);
    expect(stored!.title).toBe("My Script");
    expect(stored!.script).toBe("load aragonos");
    expect(stored!.createdAt).toBeTruthy();
    expect(stored!.updatedAt).toBeTruthy();
  });

  test("creates with default empty title and script", () => {
    const id = createScript();
    const stored = getScript(id);
    expect(stored!.title).toBe("");
    expect(stored!.script).toBe("");
  });
});

describe("getScript", () => {
  test("returns undefined for unknown IDs", () => {
    expect(getScript("nonexistent-id")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveScript
// ---------------------------------------------------------------------------

describe("saveScript", () => {
  test("updates title, script, and updatedAt while preserving createdAt", () => {
    const id = createScript("Original", "code v1");
    const original = getScript(id)!;

    saveScript(id, "Updated Title", "code v2");
    const updated = getScript(id)!;

    expect(updated.title).toBe("Updated Title");
    expect(updated.script).toBe("code v2");
    expect(updated.createdAt).toBe(original.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(original.updatedAt).getTime(),
    );
  });

  test("creates a new entry if ID does not exist yet", () => {
    saveScript("brand-new-id", "New", "content");
    const stored = getScript("brand-new-id");
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("New");
  });
});

// ---------------------------------------------------------------------------
// removeScript
// ---------------------------------------------------------------------------

describe("removeScript", () => {
  test("removes the script from the registry", () => {
    const id = createScript("ToDelete", "bye");
    expect(getScript(id)).toBeDefined();

    removeScript(id);
    expect(getScript(id)).toBeUndefined();
  });

  test("also cleans up the edit log key", () => {
    const id = createScript("WithHistory", "v1");
    saveEditLog(id, {
      base: "v1",
      ops: [{ edits: [{ r: [1, 1, 1, 3], t: "v2" }], ts: 1 }],
    });
    expect(getEditLog(id)).not.toBeNull();

    removeScript(id);
    expect(getEditLog(id)).toBeNull();
  });

  test("is a no-op for unknown IDs", () => {
    expect(() => removeScript("ghost")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getAllScripts
// ---------------------------------------------------------------------------

describe("getAllScripts", () => {
  test("returns empty array when registry is empty", () => {
    expect(getAllScripts()).toEqual([]);
  });

  test("returns scripts sorted by updatedAt descending", async () => {
    const id1 = createScript("First", "a");
    // Tiny delay so timestamps differ
    await Bun.sleep(5);
    const id2 = createScript("Second", "b");
    await Bun.sleep(5);
    const id3 = createScript("Third", "c");

    const all = getAllScripts();
    expect(all.length).toBe(3);
    expect(all[0].id).toBe(id3);
    expect(all[1].id).toBe(id2);
    expect(all[2].id).toBe(id1);
  });
});

// ---------------------------------------------------------------------------
// getOrCreatePristineScript
// ---------------------------------------------------------------------------

describe("getOrCreatePristineScript", () => {
  const PLACEHOLDER = "## Example";

  test("creates a script when none is pristine", () => {
    createScript("Titled", PLACEHOLDER);
    createScript("", "edited content");

    const id = getOrCreatePristineScript(PLACEHOLDER);
    const stored = getScript(id)!;
    expect(stored.title).toBe("");
    expect(stored.script).toBe(PLACEHOLDER);
    expect(getAllScripts().length).toBe(3);
  });

  test("reuses an existing pristine script instead of creating one", () => {
    const pristineId = createScript("", PLACEHOLDER);

    expect(getOrCreatePristineScript(PLACEHOLDER)).toBe(pristineId);
    expect(getAllScripts().length).toBe(1);
  });

  test("prunes duplicate pristine scripts, keeping the most recent", async () => {
    const oldId = createScript("", PLACEHOLDER);
    await Bun.sleep(5);
    const newId = createScript("", PLACEHOLDER);
    const keptId = createScript("Keep Me", PLACEHOLDER);

    expect(getOrCreatePristineScript(PLACEHOLDER)).toBe(newId);
    expect(getScript(oldId)).toBeUndefined();
    expect(getScript(keptId)).toBeDefined();
    expect(getAllScripts().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getEditLog / saveEditLog / clearEditLog
// ---------------------------------------------------------------------------

describe("edit log", () => {
  test("returns null for unknown IDs", () => {
    expect(getEditLog("unknown")).toBeNull();
  });

  test("round-trips an edit log", () => {
    const id = createScript("Test", "");
    const log = {
      base: "hello",
      ops: [
        {
          edits: [
            { r: [1, 1, 1, 6] as [number, number, number, number], t: "world" },
          ],
          ts: 100,
        },
      ],
    };
    saveEditLog(id, log);

    const loaded = getEditLog(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.base).toBe("hello");
    expect(loaded!.ops.length).toBe(1);
    expect(loaded!.ops[0].edits[0].t).toBe("world");
  });

  test("clearEditLog removes the key", () => {
    const id = createScript("Test", "");
    saveEditLog(id, { base: "x", ops: [] });
    expect(getEditLog(id)).not.toBeNull();

    clearEditLog(id);
    expect(getEditLog(id)).toBeNull();
  });

  test("compacts when ops exceed limit", () => {
    const id = createScript("Test", "");
    const ops = Array.from({ length: 600 }, (_, i) => ({
      edits: [
        { r: [1, 1, 1, 1] as [number, number, number, number], t: `v${i}\n` },
      ],
      ts: i,
    }));
    saveEditLog(id, { base: "", ops });

    const loaded = getEditLog(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.ops.length).toBeLessThanOrEqual(500);
  });

  test("returns null when no edit log exists", () => {
    expect(getEditLog("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLastViewedScript / setLastViewedScript
// ---------------------------------------------------------------------------

describe("last viewed script", () => {
  test("returns null when not set", () => {
    expect(getLastViewedScript()).toBeNull();
  });

  test("round-trips a UUID", () => {
    const id = "abc-123-def";
    setLastViewedScript(id);
    expect(getLastViewedScript()).toBe(id);
  });
});
