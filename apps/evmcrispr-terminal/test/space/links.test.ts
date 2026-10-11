import { describe, expect, test } from "bun:test";
import { decryptScript, encryptPayload, encryptScript } from "@evmcrispr/core";
import { applyText, head, shareOf } from "@evmcrispr/space";
import { MAX_EXPORT_CHARS } from "../../src/space/export";
import { fetchShared, shareRevision } from "../../src/space/links";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";

const serve = (body: unknown) => async () =>
  typeof body === "string" ? body : JSON.stringify(body);

describe("fetchShared", () => {
  test("a bare {title, script} pin", async () => {
    expect(
      await fetchShared(
        "cid",
        undefined,
        serve({ title: "T", script: "exec 1" }),
      ),
    ).toEqual({
      status: "found",
      title: "T",
      script: "exec 1",
      encrypted: false,
    });
  });
  test("a plain-text pin has no title", async () => {
    expect(await fetchShared("cid", undefined, serve("exec 1"))).toEqual({
      status: "found",
      title: "",
      script: "exec 1",
      encrypted: false,
    });
  });
  test("an encrypted envelope needs its key", async () => {
    const { envelope, key } = await encryptScript({
      title: "T",
      script: "exec 1",
    });
    expect(await fetchShared("cid", undefined, serve(envelope))).toEqual({
      status: "encrypted",
      reason: "missing-key",
    });
    expect(await fetchShared("cid", "AAAA", serve(envelope))).toEqual({
      status: "encrypted",
      reason: "invalid-key",
    });
    expect(await fetchShared("cid", key, serve(envelope))).toEqual({
      status: "found",
      title: "T",
      script: "exec 1",
      encrypted: true,
    });
  });
  test("a pin from a newer format asks for an upgrade, key or not", async () => {
    expect(
      await fetchShared("cid", undefined, serve({ minVersion: "99.0.0" })),
    ).toEqual({
      status: "encrypted",
      reason: "needs-upgrade",
      requiredVersion: "99.0.0",
    });
  });
  test("an empty answer, an unknown shape, a failed fetch", async () => {
    expect(
      (await fetchShared("cid", undefined, async () => undefined)).status,
    ).toBe("error");
    expect(
      (await fetchShared("cid", undefined, serve({ nope: 1 }))).status,
    ).toBe("error");
    expect(
      (
        await fetchShared("cid", undefined, async () => {
          throw new Error("gateway down");
        })
      ).status,
    ).toBe("error");
  });

  const SPACE = {
    kind: "space",
    id: "5b0c1e0e-0000-4000-8000-000000000000",
    title: "T",
    script: "# T\r\nexec 1",
    timeline: {},
  } as const;

  test("an exported space is handed over checked, and creates nothing by itself", async () => {
    const { envelope, key } = await encryptPayload(SPACE);
    const shared = await fetchShared("QmCid", key, serve(envelope));
    if (shared.status !== "space") throw new Error("expected a space");
    expect(shared.exported).toMatchObject({
      id: SPACE.id,
      script: "# T\nexec 1",
      cid: "QmCid",
      timeline: { entries: [], runs: [] },
    });
    expect(await fetchShared("QmCid", "AAAA", serve(envelope))).toEqual({
      status: "encrypted",
      reason: "invalid-key",
    });
    expect(await fetchShared("QmCid", undefined, serve(envelope))).toEqual({
      status: "encrypted",
      reason: "missing-key",
    });
  });

  test("an export that is not one is refused, saying why", async () => {
    for (const bad of [
      { ...SPACE, id: "../x" },
      { ...SPACE, timeline: { entries: [{ kind: "x" }] } },
      { ...SPACE, script: 7 },
    ]) {
      const { envelope, key } = await encryptPayload(bad as never);
      const shared = await fetchShared("QmCid", key, serve(envelope));
      expect(shared.status).toBe("refused");
    }
  });

  test("too large an envelope is refused before it is decrypted or parsed", async () => {
    const { envelope, key } = await encryptPayload(SPACE);
    const huge = { ...envelope, data: "A".repeat(MAX_EXPORT_CHARS + 1) };
    // A valid key and a wrong one get the same answer: nothing was tried.
    for (const k of [key, "AAAA", undefined])
      expect((await fetchShared("QmCid", k, serve(huge))).status).toBe(
        "refused",
      );
    const parse = JSON.parse;
    let parsed = 0;
    JSON.parse = (...args) => {
      parsed++;
      return parse(...args);
    };
    try {
      const shared = await fetchShared(
        "QmCid",
        key,
        async () => `{"x":"${"A".repeat(MAX_EXPORT_CHARS + 20_000)}"}`,
      );
      expect(shared.status).toBe("refused");
      expect(parsed).toBe(0);
    } finally {
      JSON.parse = parse;
    }
  });
});

describe("shareRevision", () => {
  const setup = async () => {
    const browser = testBrowser();
    const app = browser.tab();
    const id = await app.spaces.create({
      text: "# Pay\nexec 1",
      source: "user",
    });
    const space = (await app.spaces.acquire(id))!;
    const pins: any[] = [];
    const deps = {
      origin: "https://x.test",
      viewMode: "edit" as const,
      pin: async (envelope: unknown) => {
        pins.push(envelope);
        return { IpfsHash: `QmCid${pins.length}` };
      },
    };
    return { browser, id, space, pins, deps };
  };

  test("pins that revision's text, records the share as its own entry, and hands the same link again without pinning", async () => {
    const { browser, id, space, pins, deps } = await setup();
    const revision = head(space.timeline.getState())!;
    const shared = await shareRevision(space, revision.id, deps);
    if (!shared.ok) throw new Error("expected a link");
    expect(shared.url).toMatch(/^https:\/\/x\.test\/#\/QmCid1#[\w-]{43}$/);
    expect(await decryptScript(pins[0], shared.key)).toEqual({
      title: "Pay",
      script: "# Pay\nexec 1",
    });
    const entry = shareOf(space.timeline.getState(), revision.id);
    expect(entry).toMatchObject({
      kind: "share",
      revisionId: revision.id,
      cid: "QmCid1",
      key: shared.key,
      author: { kind: "user" },
    });
    // The revision itself was not rewritten.
    expect(space.timeline.getState().entries.get(revision.id)).toBe(revision);
    // Again, and after typing more: the remembered link, nothing pinned.
    applyText(space.text, "# Pay\nexec 2", ORIGIN.user);
    const again = await shareRevision(space, revision.id, {
      ...deps,
      viewMode: "view",
    });
    expect(again).toMatchObject({
      ok: true,
      url: `https://x.test/#/QmCid1?mode=view#${shared.key}`,
    });
    expect(pins).toHaveLength(1);
    // Another tab sees it shared.
    const other = (await browser.tab().spaces.acquire(id))!;
    await settle();
    expect(shareOf(other.timeline.getState(), revision.id)?.cid).toBe("QmCid1");
  });

  test("only the approved text is shared: an unreviewed revision, and an older one, are refused and nothing is pinned", async () => {
    const { space, pins, deps } = await setup();
    const first = head(space.timeline.getState())!;
    applyText(space.text, "# Pay\nexec 2", ORIGIN.user);
    space.record("user");
    expect(await shareRevision(space, first.id, deps)).toEqual({
      ok: false,
      reason: "unreviewed",
    });
    space.editAsTurn("t", { kind: "write", text: "exec 666" });
    const theirs = space.endTurn("t")!;
    expect(await shareRevision(space, theirs.id, deps)).toEqual({
      ok: false,
      reason: "unreviewed",
    });
    expect(await shareRevision(space, "nope", deps)).toEqual({
      ok: false,
      reason: "gone",
    });
    expect(pins).toHaveLength(0);
  });

  test("a link an export claims for a revision is never handed out", async () => {
    const { space, pins, deps } = await setup();
    const revision = head(space.timeline.getState())!;
    space.commit({
      entries: [
        {
          kind: "share",
          id: crypto.randomUUID(),
          ts: 1,
          author: { kind: "user" },
          revisionId: revision.id,
          cid: "QmEvil",
          key: "A".repeat(43),
          unverified: true,
        },
      ],
    });
    const shared = await shareRevision(space, revision.id, deps);
    expect(shared).toMatchObject({ ok: true, cid: "QmCid1" });
    expect(pins).toHaveLength(1);
  });
});
