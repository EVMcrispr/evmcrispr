import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { encryptScript, IPFSResolver } from "@evmcrispr/core";
import { renderHook, waitFor } from "@testing-library/react";

import { useScriptFromId } from "../../src/hooks/useStoredScript";

const CID_BASE = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbd";
const CONTENT = { title: "Shared", script: "load token\nprint @me" };

const originalFetch = globalThis.fetch;
const originalTrustGateway = IPFSResolver.trustGateway;
// Base-58 alphabet characters that keep the CID valid — one fresh CID per
// test because fetch-pin's module-level resolver caches pin text forever.
const CID_SUFFIXES = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let cidIndex = 0;
let testCid = "";

function mockPinResponse(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  globalThis.fetch = mock(
    async () =>
      new Response(text, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  IPFSResolver.trustGateway = true;
  const suffix = CID_SUFFIXES[cidIndex++];
  if (!suffix) throw new Error("CID suffix pool exhausted — extend it");
  testCid = `${CID_BASE}${suffix}`;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  IPFSResolver.trustGateway = originalTrustGateway;
});

describe("useScriptFromId (IPFS)", () => {
  test("loads a bare {title, script} pin", async () => {
    mockPinResponse(CONTENT);

    const { result } = renderHook(() => useScriptFromId(testCid));

    await waitFor(() => expect(result.current?.status).toBe("found"));
    expect(result.current).toEqual({ status: "found", data: CONTENT });
  });

  test("loads a plain-text pin with an empty title", async () => {
    const text = "load token\nprint @me";
    mockPinResponse(text);

    const { result } = renderHook(() => useScriptFromId(testCid));

    await waitFor(() => expect(result.current?.status).toBe("found"));
    expect(result.current).toEqual({
      status: "found",
      data: { title: "", script: text },
    });
  });

  test("decrypts an encrypted pin with the correct key", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    mockPinResponse(envelope);

    const { result } = renderHook(() => useScriptFromId(testCid, key));

    await waitFor(() => expect(result.current?.status).toBe("found"));
    expect(result.current).toEqual({
      status: "found",
      data: CONTENT,
      encrypted: true,
    });
  });

  test("reports missing-key for an encrypted pin without a key", async () => {
    const { envelope } = await encryptScript(CONTENT);
    mockPinResponse(envelope);

    const { result } = renderHook(() => useScriptFromId(testCid));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "missing-key",
    });
  });

  test("reports invalid-key for a wrong key", async () => {
    const { envelope } = await encryptScript(CONTENT);
    const { key: wrongKey } = await encryptScript(CONTENT);
    mockPinResponse(envelope);

    const { result } = renderHook(() => useScriptFromId(testCid, wrongKey));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "invalid-key",
    });
  });

  test("reports needs-upgrade for an envelope from a newer version", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    mockPinResponse({ ...envelope, minVersion: "99.0.0" });

    const { result } = renderHook(() => useScriptFromId(testCid, key));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "needs-upgrade",
      requiredVersion: "99.0.0",
    });
  });

  test("reports needs-upgrade even without a key or a recognizable shape", async () => {
    mockPinResponse({ minVersion: "99.0.0", unknownFutureField: true });

    const { result } = renderHook(() => useScriptFromId(testCid));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "needs-upgrade",
      requiredVersion: "99.0.0",
    });
  });

  test("reports an error for unrecognized pin content", async () => {
    mockPinResponse({ something: "else" });

    const { result } = renderHook(() => useScriptFromId(testCid));

    await waitFor(() => expect(result.current?.status).toBe("error"));
  });
});
