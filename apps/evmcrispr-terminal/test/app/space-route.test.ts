import { describe, expect, test } from "bun:test";
import { head, isReviewed, revisions } from "@evmcrispr/space";
import { type RouteInput, resolveRoute } from "../../src/app/space-route";
import { SCRIPT_PLACEHOLDER } from "../../src/app/ui-store";
import type { LiveSpace } from "../../src/space/live-space";
import { testBrowser } from "../helpers/app";

// A real CIDv0, so `isCID` accepts it. Its content is whatever `serve` says.
const CID = "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry";
const at = (input: Partial<RouteInput> = {}): RouteInput => ({
  id: undefined,
  key: undefined,
  inline: { title: null, script: null },
  ...input,
});
const never = async () => {
  throw new Error("no fetch expected");
};
const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);

describe("resolveRoute", () => {
  test("no id: a placeholder space, reused while untouched", async () => {
    const app = testBrowser().tab();
    const first = await resolveRoute(app, at(), never);
    const again = await resolveRoute(app, at(), never);
    if (first.kind !== "created" || again.kind !== "created")
      throw new Error("expected created");
    expect(again.id).toBe(first.id);
    expect(first.received).toBe(false);

    const space = (await app.spaces.acquire(first.id))!;
    expect(space.getText()).toBe(SCRIPT_PLACEHOLDER);
    space.text.insert(0, "x");
    app.spaces.release(first.id);
    const fresh = await resolveRoute(app, at(), never);
    if (fresh.kind !== "created") throw new Error("expected created");
    expect(fresh.id).not.toBe(first.id);
  });

  test("an inline link becomes a space with its title as first comment, approved as it arrived", async () => {
    const app = testBrowser().tab();
    const r = await resolveRoute(
      app,
      at({ inline: { title: "From Safe", script: "exec 1" } }),
      never,
    );
    if (r.kind !== "created") throw new Error("expected created");
    // Received, like a share link: the UI says so. It does not gate it.
    expect(r.received).toBe(true);
    expect(r.encrypted).toBe(false);
    const space = (await app.spaces.acquire(r.id))!;
    expect(space.getText()).toBe("# From Safe\nexec 1");
    expect(head(space.timeline.getState())!.source).toBe("import");
    expect(reviewed(space)).toBe(true);
  });

  test("a share link becomes a new space that records where it came from", async () => {
    const app = testBrowser().tab();
    const serve = async () =>
      JSON.stringify({ title: "Treasury", script: "exec 1" });
    const r = await resolveRoute(app, at({ id: CID }), serve);
    if (r.kind !== "created") throw new Error("expected created");
    expect(r.received).toBe(true);
    const space = (await app.spaces.acquire(r.id))!;
    const [first] = revisions(space.timeline.getState());
    expect(first.origin).toEqual({ cid: CID });
    expect(space.getText()).toBe("# Treasury\nexec 1");
    expect(reviewed(space)).toBe(true);
  });

  test("a known id opens; an unknown one is not found", async () => {
    const app = testBrowser().tab();
    const id = await app.spaces.create({ text: "exec 1", source: "user" });
    expect(await resolveRoute(app, at({ id }), never)).toEqual({
      kind: "open",
      id,
    });
    expect(
      await resolveRoute(
        app,
        at({ id: "5b0c1e0e-0000-4000-8000-000000000000" }),
        never,
      ),
    ).toEqual({ kind: "not-found" });
  });

  test("a failed fetch is reported and creates nothing", async () => {
    const app = testBrowser().tab();
    expect(
      await resolveRoute(app, at({ id: CID }), async () => {
        throw new Error("down");
      }),
    ).toEqual({ kind: "ipfs-error" });
    expect(app.spaces.index.getState()).toEqual([]);
  });

  test("storage failing is reported as an address that cannot be opened, never thrown", async () => {
    const app = testBrowser().tab();
    app.storage.records.getSpace = async () => {
      throw new Error("the database is gone");
    };
    expect(
      await resolveRoute(
        app,
        at({ id: "5b0c1e0e-0000-4000-8000-000000000000" }),
        never,
      ),
    ).toEqual({ kind: "not-found" });
    app.spaces.create = async () => {
      throw new Error("quota");
    };
    expect(
      await resolveRoute(app, at({ id: CID }), async () => "exec 1"),
    ).toEqual({ kind: "ipfs-error" });
    expect(await resolveRoute(app, at(), never)).toEqual({ kind: "not-found" });
  });
});
