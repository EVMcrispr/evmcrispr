import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { encryptScript } from "@evmcrispr/core";
import { renderHook, waitFor } from "@testing-library/react";

import { useScriptFromId } from "../../src/hooks/useStoredScript";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const CONTENT = { title: "Shared", script: "load token\nprint @me" };

const originalFetch = globalThis.fetch;

function mockPinResponse(body: unknown) {
  globalThis.fetch = mock(async () => ({
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("useScriptFromId (IPFS)", () => {
  test("loads a legacy plaintext pin", async () => {
    mockPinResponse(CONTENT);

    const { result } = renderHook(() => useScriptFromId(CID));

    await waitFor(() => expect(result.current?.status).toBe("found"));
    expect(result.current).toEqual({ status: "found", data: CONTENT });
  });

  test("decrypts an encrypted pin with the correct key", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    mockPinResponse(envelope);

    const { result } = renderHook(() => useScriptFromId(CID, key));

    await waitFor(() => expect(result.current?.status).toBe("found"));
    expect(result.current).toEqual({ status: "found", data: CONTENT });
  });

  test("reports missing-key for an encrypted pin without a key", async () => {
    const { envelope } = await encryptScript(CONTENT);
    mockPinResponse(envelope);

    const { result } = renderHook(() => useScriptFromId(CID));

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

    const { result } = renderHook(() => useScriptFromId(CID, wrongKey));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "invalid-key",
    });
  });

  test("reports needs-upgrade for an envelope from a newer version", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    mockPinResponse({ ...envelope, minVersion: "99.0.0" });

    const { result } = renderHook(() => useScriptFromId(CID, key));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "needs-upgrade",
      requiredVersion: "99.0.0",
    });
  });

  test("reports needs-upgrade even without a key or a recognizable shape", async () => {
    mockPinResponse({ minVersion: "99.0.0", unknownFutureField: true });

    const { result } = renderHook(() => useScriptFromId(CID));

    await waitFor(() => expect(result.current?.status).toBe("encrypted"));
    expect(result.current).toEqual({
      status: "encrypted",
      reason: "needs-upgrade",
      requiredVersion: "99.0.0",
    });
  });

  test("reports an error for unrecognized pin content", async () => {
    mockPinResponse({ something: "else" });

    const { result } = renderHook(() => useScriptFromId(CID));

    await waitFor(() => expect(result.current?.status).toBe("error"));
  });
});
