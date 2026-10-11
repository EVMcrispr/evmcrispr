import { beforeEach, describe, expect, test } from "bun:test";
import { head, isReviewed, revisions } from "@evmcrispr/space";
import { createSpaces } from "../../src/space/spaces";
import { tabTransport } from "../../src/space/tab-transport";
import { createChanges } from "../../src/storage/changes";
import { memoryStorage } from "../../src/storage/index";
import { LockTable, localLocks } from "../../src/storage/locks";
import { migrate } from "../../src/storage/migrate";
import { local } from "../helpers/local";
import { channelHub } from "../helpers/tabs";

/** Today's localStorage, as `utils/local-storage.ts` wrote it. */
const A = "5b0c1e0e-1111-4111-8111-111111111111";
const B = "5b0c1e0e-2222-4222-8222-222222222222";
const fixture = () => ({
  "evmcrispr:migrated": "1",
  "evmcrispr:scripts": JSON.stringify({
    [A]: {
      id: A,
      title: "Pay the team",
      script: "exec 1",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-03-04T00:00:00.000Z",
    },
    [B]: {
      id: B,
      title: "",
      script: "# Already titled\nexec 2",
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
    },
  }),
  "evmcrispr:edits:x": '{"base":"","ops":[]}',
});

function setup(initial: Record<string, string>) {
  const storage = memoryStorage();
  const hub = channelHub();
  const table = new LockTable();
  const tab = () => {
    const locks = localLocks(table);
    const spaces = createSpaces({
      storage,
      transport: tabTransport(hub),
      changes: createChanges(hub),
      locks,
      now: () => 7_000_000_000_000,
      me: () => ({ kind: "user" }),
    });
    return { spaces, records: storage.records, locks };
  };
  return { store: local(initial), tab };
}

describe("migration", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup(fixture());
  });

  test("scripts become spaces with the old id, title as first comment, one import revision", async () => {
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    const a = (await tab.spaces.acquire(A))!;
    expect(a.getText()).toBe("# Pay the team\nexec 1");
    const [first, ...rest] = revisions(a.timeline.getState());
    expect(rest).toEqual([]);
    expect(first.source).toBe("import");
    expect(first.ts).toBe(Date.parse("2026-03-04T00:00:00.000Z"));
    expect(isReviewed(a.getText(), a.markers.getState().approvedText)).toBe(
      true,
    );
    const b = (await tab.spaces.acquire(B))!;
    expect(b.getText()).toBe("# Already titled\nexec 2");
    const listed = tab.spaces.index.getState();
    expect(listed.map((s) => s.title)).toEqual([
      "Already titled",
      "Pay the team",
    ]);
    expect(listed[1].updatedAt).toBe(Date.parse("2026-03-04T00:00:00.000Z"));
    expect(listed.every((s) => !s.unreviewed)).toBe(true);
  });

  test("old storage is left byte-for-byte unchanged, apart from the new flag", async () => {
    const before = fixture();
    await migrate({ ...t.tab(), local: t.store, persistent: true });
    for (const [key, value] of Object.entries(before))
      expect(t.store.data.get(key)).toBe(value);
    expect([...t.store.data.keys()].sort()).toEqual(
      [...Object.keys(before), "evmcrispr:migrated:spaces"].sort(),
    );
  });

  test("a second run is a no-op", async () => {
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    const a = (await tab.spaces.acquire(A))!;
    const id = head(a.timeline.getState())!.id;
    t.store.data.delete("evmcrispr:migrated:spaces");
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(tab.spaces.index.getState().length).toBe(2);
    expect(head(a.timeline.getState())!.id).toBe(id);
  });

  test("a corrupt record is skipped, the others proceed, and the flag waits", async () => {
    const scripts = JSON.parse(fixture()["evmcrispr:scripts"]);
    scripts.bad = { id: "bad", title: 3 };
    t = setup({ ...fixture(), "evmcrispr:scripts": JSON.stringify(scripts) });
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(tab.spaces.index.getState().length).toBe(2);
    expect(t.store.getItem("evmcrispr:migrated:spaces")).toBeNull();
  });

  test("an untouched placeholder script is not migrated", async () => {
    const scripts = JSON.parse(fixture()["evmcrispr:scripts"]);
    const placeholder =
      "## Example: deposit 1 ETH into WETH\n\n# switch mainnet\n# exec @token(WETH) deposit() --value 1e18\n";
    scripts.p = {
      id: "p",
      title: "",
      script: placeholder,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    t = setup({ ...fixture(), "evmcrispr:scripts": JSON.stringify(scripts) });
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(tab.spaces.index.getState().length).toBe(2);
    expect(t.store.getItem("evmcrispr:migrated:spaces")).toBe("1");
  });

  test("an unreadable blob migrates nothing and does not throw", async () => {
    t = setup({ "evmcrispr:scripts": "{not json" });
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(tab.spaces.index.getState()).toEqual([]);
  });

  test("two tabs: one migrates, the other waits and finds it done", async () => {
    const [one, two] = [t.tab(), t.tab()];
    await Promise.all([
      migrate({ ...one, local: t.store, persistent: true }),
      migrate({ ...two, local: t.store, persistent: true }),
    ]);
    expect((await one.records.listSpaces()).length).toBe(2);
  });

  test("scripts from before ids existed are migrated once", async () => {
    t = setup({
      savedScripts: JSON.stringify({
        old: { title: "Old one", date: "x", script: "exec 9" },
      }),
    });
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: true });
    t.store.data.delete("evmcrispr:migrated:spaces");
    await migrate({ ...tab, local: t.store, persistent: true });
    const listed = tab.spaces.index.getState();
    expect(listed.map((s) => s.title)).toEqual(["Old one"]);
  });

  test("into storage that will not last, scripts are usable but not marked as migrated", async () => {
    const tab = t.tab();
    await migrate({ ...tab, local: t.store, persistent: false });
    expect(tab.spaces.index.getState().length).toBe(2);
    expect(t.store.getItem("evmcrispr:migrated:spaces")).toBeNull();
  });

  test("a space left half-made by an interrupted migration is made again", async () => {
    const tab = t.tab();
    // What a tab closed between the index record and the document leaves.
    await tab.records.putSpace({
      id: A,
      title: "Untitled",
      createdAt: 1,
      updatedAt: 1,
      unreviewed: false,
    });
    await migrate({ ...tab, local: t.store, persistent: true });
    const a = (await tab.spaces.acquire(A))!;
    expect(a.getText()).toBe("# Pay the team\nexec 1");
    expect(revisions(a.timeline.getState()).length).toBe(1);
    expect(isReviewed(a.getText(), a.markers.getState().approvedText)).toBe(
      true,
    );
  });

  test("a pre-id script that fails is tried again, and the others are not duplicated", async () => {
    t = setup({
      savedScripts: JSON.stringify({
        one: { title: "One", script: "exec 1" },
        two: { title: "Two", script: "exec 2" },
      }),
    });
    const tab = t.tab();
    const create = tab.spaces.create;
    let failing = true;
    tab.spaces.create = async (init, id) => {
      if (failing && init.text.includes("exec 2")) throw new Error("quota");
      return create(init, id);
    };
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(t.store.getItem("evmcrispr:migrated:spaces")).toBeNull();
    failing = false;
    await migrate({ ...tab, local: t.store, persistent: true });
    expect(
      tab.spaces.index
        .getState()
        .map((s) => s.title)
        .sort(),
    ).toEqual(["One", "Two"]);
    expect(t.store.getItem("evmcrispr:migrated:spaces")).toBe("1");
  });
});
