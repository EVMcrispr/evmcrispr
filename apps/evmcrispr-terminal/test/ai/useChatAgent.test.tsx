import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  AUTH_ERROR_MESSAGE,
  BALANCE_ERROR_MESSAGE,
  useChatAgent,
} from "@evmcrispr/ai";
import { act, renderHook } from "@testing-library/react";

const API_KEY_STORAGE_KEY = "evmcrispr:nexusApiKey";

// A stand-in Nexus. Only the socket is faked: the provider still parses these
// responses, so `streamText` fails with the same `APICallError` the live
// gateway produces and the hook's real error path runs.
let respond: () => Response = () => new Response("{}");
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => respond()) as unknown as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

function rejection(status: number, error: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderAgent() {
  return renderHook(() =>
    useChatAgent({
      systemPrompt: "test",
      tools: {},
      maxSteps: 1,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(API_KEY_STORAGE_KEY, "nexus-key");
});

describe("useChatAgent auth recovery", () => {
  test("an auth failure drops the key so the host can offer a fresh login", async () => {
    respond = () =>
      rejection(401, {
        message: "API key not found",
        type: "authentication_error",
        code: "invalid_api_key",
      });

    const { result } = renderAgent();
    expect(result.current.hasKey).toBe(true);

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(false);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
    expect(result.current.errorKind).toBe("auth");
    expect(result.current.error).toBe(AUTH_ERROR_MESSAGE);
  });

  test("an empty balance keeps the key and says so", async () => {
    respond = () =>
      // Re-logging in would revoke a working key and buy no credit.
      rejection(403, {
        message: "Insufficient balance to reserve output tokens",
        type: "insufficient_balance",
        code: "insufficient_balance",
      });

    const { result } = renderAgent();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(true);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe("nexus-key");
    expect(result.current.errorKind).toBe("balance");
    expect(result.current.error).toBe(BALANCE_ERROR_MESSAGE);
  });

  test("an unrelated failure keeps the key and its own message", async () => {
    respond = () =>
      rejection(400, {
        message: "model `kimi-k9` does not exist",
        type: "invalid_request_error",
      });

    const { result } = renderAgent();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(true);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe("nexus-key");
    expect(result.current.errorKind).toBe("other");
    expect(result.current.error).toBe("model `kimi-k9` does not exist");
  });

  test("clearApiKey leaves no banner behind", async () => {
    respond = () =>
      rejection(403, {
        message: "Insufficient balance",
        code: "insufficient_balance",
      });

    const { result } = renderAgent();
    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearApiKey();
    });

    expect(result.current.hasKey).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.errorKind).toBeNull();
  });
});
