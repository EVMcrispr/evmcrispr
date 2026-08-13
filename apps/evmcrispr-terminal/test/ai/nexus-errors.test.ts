import { beforeEach, describe, expect, test } from "bun:test";
import { APICallError } from "ai";

import { classifyChatError, handleChatError } from "../../src/ai/nexus-errors";
import { getNexusApiKey, saveNexusApiKey } from "../../src/utils/local-storage";

beforeEach(() => {
  localStorage.clear();
});

/** An API failure as the openai-compatible provider builds it. */
function apiError({
  statusCode,
  data,
  responseBody,
  message = "boom",
}: {
  statusCode?: number;
  data?: unknown;
  responseBody?: string;
  message?: string;
}) {
  return new APICallError({
    message,
    url: "https://nexus-api.dappnode.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    data,
    responseBody,
  });
}

/** The parsed shape the provider puts on `data`. */
function body(error: Record<string, unknown>) {
  return { error: { message: "server says so", ...error } };
}

describe("classifyChatError", () => {
  test("keeps treating a bare 401 with no body as an auth failure", () => {
    const error = classifyChatError(apiError({ statusCode: 401 }));
    expect(error.kind).toBe("auth");
    expect(error.message).toContain("Log in again");
  });

  test("treats a 403 (revoked key) as an auth failure", () => {
    expect(classifyChatError(apiError({ statusCode: 403 })).kind).toBe("auth");
  });

  test("reads authentication_error out of the parsed body", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 400,
        data: body({ type: "authentication_error", code: "invalid_api_key" }),
      }),
    );
    expect(error.kind).toBe("auth");
  });

  test("reads the body out of raw response text when data is missing", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 400,
        responseBody: JSON.stringify(body({ code: "invalid_api_key" })),
      }),
    );
    expect(error.kind).toBe("auth");
  });

  test("accepts a flat body without the error envelope", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 400,
        data: { type: "authentication_error", message: "nope" },
      }),
    );
    expect(error.kind).toBe("auth");
  });

  test("does not treat insufficient_balance as an auth failure", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 403,
        data: body({ code: "insufficient_balance" }),
      }),
    );
    expect(error.kind).toBe("balance");
    expect(error.message).toContain("run out of credit");
  });

  test("treats a 402 as a balance failure", () => {
    expect(classifyChatError(apiError({ statusCode: 402 })).kind).toBe(
      "balance",
    );
  });

  test("reports rate limiting on its own", () => {
    const error = classifyChatError(apiError({ statusCode: 429 }));
    expect(error.kind).toBe("other");
    expect(error.message).toContain("rate limiting");
  });

  test("falls back to the server message for anything else", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 500,
        data: body({ type: "server_error", message: "upstream exploded" }),
      }),
    );
    expect(error).toEqual({ kind: "other", message: "upstream exploded" });
  });

  test("survives a body that is not JSON", () => {
    const error = classifyChatError(
      apiError({
        statusCode: 502,
        responseBody: "<html>Bad Gateway</html>",
        message: "Bad Gateway",
      }),
    );
    expect(error).toEqual({ kind: "other", message: "Bad Gateway" });
  });

  test("survives a body with none of the known fields", () => {
    const error = classifyChatError(
      apiError({ statusCode: 400, data: { detail: "???" }, message: "huh" }),
    );
    expect(error).toEqual({ kind: "other", message: "huh" });
  });

  test("explains a failed fetch instead of showing 'Failed to fetch'", () => {
    const error = classifyChatError(new TypeError("Failed to fetch"));
    expect(error.kind).toBe("other");
    expect(error.message).toContain("Could not reach Nexus");
  });

  test("handles non-Error throws", () => {
    expect(classifyChatError("kaboom")).toEqual({
      kind: "other",
      message: "kaboom",
    });
  });
});

describe("handleChatError", () => {
  test("clears the stored key on an auth failure", () => {
    saveNexusApiKey("nx-dead");
    handleChatError(apiError({ statusCode: 401 }));
    expect(getNexusApiKey()).toBeNull();
  });

  test("keeps the OAuth session, which login reuses", () => {
    saveNexusApiKey("nx-dead");
    localStorage.setItem("evmcrispr:nexusAuth", '{"key_id":"k1"}');
    handleChatError(apiError({ statusCode: 401 }));
    expect(localStorage.getItem("evmcrispr:nexusAuth")).toBe('{"key_id":"k1"}');
  });

  test("keeps the key when the balance ran out", () => {
    saveNexusApiKey("nx-live");
    handleChatError(
      apiError({
        statusCode: 403,
        data: body({ code: "insufficient_balance" }),
      }),
    );
    expect(getNexusApiKey()).toBe("nx-live");
  });

  test("keeps the key on a network failure", () => {
    saveNexusApiKey("nx-live");
    handleChatError(new TypeError("Failed to fetch"));
    expect(getNexusApiKey()).toBe("nx-live");
  });
});
