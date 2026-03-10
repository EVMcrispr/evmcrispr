import { beforeEach, describe, expect, test } from "bun:test";
import {
  getAllScripts,
  getEditLog,
  getLastViewedScript,
} from "../../src/utils/local-storage";
import { migrateFromLegacyStorage } from "../../src/utils/migration";

beforeEach(() => {
  localStorage.clear();
});

describe("migrateFromLegacyStorage", () => {
  test("is a no-op and sets migrated flag when no legacy data exists", () => {
    migrateFromLegacyStorage();

    expect(getAllScripts()).toEqual([]);
    expect(localStorage.getItem("evmcrispr:migrated")).toBe("1");
  });

  test("migrates legacy savedScripts to UUID-keyed entries", () => {
    localStorage.setItem(
      "savedScripts",
      JSON.stringify({
        "my-script": {
          title: "My Script",
          script: "load aragonos",
          date: "2024-01-15T00:00:00.000Z",
        },
        another: {
          title: "Another",
          script: "exec vault",
          date: "2024-02-20T00:00:00.000Z",
        },
      }),
    );

    migrateFromLegacyStorage();

    const all = getAllScripts();
    expect(all.length).toBe(2);

    const titles = all.map((s) => s.title).sort();
    expect(titles).toEqual(["Another", "My Script"]);

    for (const s of all) {
      expect(s.id).toMatch(/^[0-9a-f-]+$/);
      const log = getEditLog(s.id);
      expect(log).not.toBeNull();
      expect(log!.base).toBe(s.script);
    }
  });

  test("migrates legacy terminal-store (zustand persist) data", () => {
    localStorage.setItem(
      "terminal-store",
      JSON.stringify({
        state: {
          title: "Current Session",
          script: "set $x 42",
        },
      }),
    );

    migrateFromLegacyStorage();

    const all = getAllScripts();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Current Session");
    expect(all[0].script).toBe("set $x 42");
    expect(getLastViewedScript()).toBe(all[0].id);
  });

  test("migrates both sources; lastScript points to zustand session", () => {
    localStorage.setItem(
      "savedScripts",
      JSON.stringify({
        "lib-script": {
          title: "Lib Script",
          script: "exec foo",
          date: "2024-01-01T00:00:00.000Z",
        },
      }),
    );
    localStorage.setItem(
      "terminal-store",
      JSON.stringify({
        state: { title: "Active", script: "exec bar" },
      }),
    );

    migrateFromLegacyStorage();

    const all = getAllScripts();
    expect(all.length).toBe(2);

    const lastId = getLastViewedScript();
    const lastScript = all.find((s) => s.id === lastId);
    expect(lastScript).toBeDefined();
    expect(lastScript!.title).toBe("Active");
  });

  test("is idempotent -- calling twice does not duplicate entries", () => {
    localStorage.setItem(
      "savedScripts",
      JSON.stringify({
        "only-one": {
          title: "Only One",
          script: "code",
          date: "2024-06-01T00:00:00.000Z",
        },
      }),
    );

    migrateFromLegacyStorage();
    const countAfterFirst = getAllScripts().length;

    migrateFromLegacyStorage();
    const countAfterSecond = getAllScripts().length;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1);
  });

  test("gracefully skips corrupted JSON", () => {
    localStorage.setItem("savedScripts", "not valid json {{{");
    localStorage.setItem("terminal-store", "also broken!!!");

    expect(() => migrateFromLegacyStorage()).not.toThrow();
    expect(getAllScripts()).toEqual([]);
    expect(localStorage.getItem("evmcrispr:migrated")).toBe("1");
  });

  test("skips entries with empty title and script", () => {
    localStorage.setItem(
      "savedScripts",
      JSON.stringify({
        empty: { title: "", script: "", date: "2024-01-01T00:00:00.000Z" },
        real: {
          title: "Real",
          script: "code",
          date: "2024-01-01T00:00:00.000Z",
        },
      }),
    );

    migrateFromLegacyStorage();
    expect(getAllScripts().length).toBe(1);
    expect(getAllScripts()[0].title).toBe("Real");
  });

  test("skips zustand data with only whitespace script", () => {
    localStorage.setItem(
      "terminal-store",
      JSON.stringify({ state: { title: "", script: "   " } }),
    );

    migrateFromLegacyStorage();
    expect(getAllScripts()).toEqual([]);
  });
});
