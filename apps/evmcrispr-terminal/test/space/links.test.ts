import { describe, expect, test } from "bun:test";
import { encryptScript } from "@evmcrispr/core";
import { fetchShared } from "../../src/space/links";

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
});
