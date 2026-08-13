import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";

import {
  AUTH_ERROR_MESSAGE,
  BALANCE_ERROR_MESSAGE,
  classifyChatError,
  RATE_LIMIT_ERROR_MESSAGE,
} from "../src/chat-errors";

/** An `APICallError` as the OpenAI-compatible provider builds one: `data` is
 *  the parsed body, `responseBody` the raw text. */
function apiError({
  statusCode,
  body,
  message = "Nexus request failed",
}: {
  statusCode?: number;
  body?: unknown;
  message?: string;
}): APICallError {
  return new APICallError({
    message,
    url: "https://nexus-api.dappnode.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody: body === undefined ? undefined : JSON.stringify(body),
    data: body,
  });
}

describe("classifyChatError", () => {
  test("a bare 401 with no error body is an auth failure", () => {
    expect(classifyChatError(apiError({ statusCode: 401 }))).toEqual({
      kind: "auth",
      message: AUTH_ERROR_MESSAGE,
    });
  });

  test("a 401 with an unrelated error body is still an auth failure", () => {
    const error = apiError({
      statusCode: 401,
      body: { error: { message: "no", type: "invalid_request_error" } },
    });
    expect(classifyChatError(error).kind).toBe("auth");
  });

  test("reads type/code out of the Nexus error body", () => {
    const error = apiError({
      statusCode: 400,
      body: {
        error: {
          message: "API key not found",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      },
    });
    expect(classifyChatError(error)).toEqual({
      kind: "auth",
      message: AUTH_ERROR_MESSAGE,
    });
  });

  test("reads a flattened error body too", () => {
    const error = apiError({
      statusCode: 400,
      body: { type: "authentication_error", message: "bad key" },
    });
    expect(classifyChatError(error).kind).toBe("auth");
  });

  test("falls back to the raw response body when `data` is unparsed", () => {
    const error = new APICallError({
      message: "Nexus request failed",
      url: "https://nexus-api.dappnode.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 400,
      responseBody: JSON.stringify({ error: { code: "invalid_api_key" } }),
    });
    expect(classifyChatError(error).kind).toBe("auth");
  });

  test("insufficient_balance is a balance failure, never an auth one", () => {
    const error = apiError({
      // Nexus reserves max_tokens upfront and rejects with a 403 body that
      // would otherwise read as a dead key.
      statusCode: 403,
      body: {
        error: {
          message: "Insufficient balance to reserve 16384 output tokens",
          type: "insufficient_balance",
          code: "insufficient_balance",
        },
      },
    });
    expect(classifyChatError(error)).toEqual({
      kind: "balance",
      message: BALANCE_ERROR_MESSAGE,
    });
  });

  test("402 with no body is a balance failure", () => {
    expect(classifyChatError(apiError({ statusCode: 402 })).kind).toBe(
      "balance",
    );
  });

  test("403 with no body is an auth failure", () => {
    expect(classifyChatError(apiError({ statusCode: 403 })).kind).toBe("auth");
  });

  test("rate limits are neither auth nor balance", () => {
    expect(classifyChatError(apiError({ statusCode: 429 }))).toEqual({
      kind: "other",
      message: RATE_LIMIT_ERROR_MESSAGE,
    });
    const coded = apiError({
      statusCode: 400,
      body: { error: { code: "rate_limit_exceeded" } },
    });
    expect(classifyChatError(coded).kind).toBe("other");
  });

  test("a 500 keeps the underlying message", () => {
    const error = apiError({ statusCode: 500, message: "Bad gateway" });
    expect(classifyChatError(error)).toEqual({
      kind: "other",
      message: "Bad gateway",
    });
  });

  test("prefers the error body's message over the error's own", () => {
    const error = apiError({
      statusCode: 400,
      message: "Nexus request failed",
      body: { error: { message: "model `kimi-k9` does not exist" } },
    });
    expect(classifyChatError(error)).toEqual({
      kind: "other",
      message: "model `kimi-k9` does not exist",
    });
  });

  test("survives bodies and errors that carry nothing useful", () => {
    expect(
      classifyChatError(apiError({ statusCode: 400, body: null })),
    ).toEqual({ kind: "other", message: "Nexus request failed" });
    expect(
      classifyChatError(apiError({ statusCode: 400, body: "not json" })).kind,
    ).toBe("other");
    expect(
      classifyChatError(
        apiError({ statusCode: 400, body: { error: { code: 42, type: [] } } }),
      ).kind,
    ).toBe("other");
    expect(classifyChatError(new TypeError("Failed to fetch"))).toEqual({
      kind: "other",
      message: "Failed to fetch",
    });
    expect(classifyChatError("boom")).toEqual({
      kind: "other",
      message: "boom",
    });
    expect(classifyChatError(null).kind).toBe("other");
  });
});
