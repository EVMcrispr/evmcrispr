import { APICallError } from "ai";

/**
 * What went wrong with a chat run, from the host UI's point of view.
 *
 * - `auth`   — the API key is dead. The host should drop it and offer a fresh
 *              login; re-provisioning is the only way forward.
 * - `balance` — the account is out of credit. The key is fine; logging in
 *              again would revoke a working key and change nothing.
 * - `other`  — everything else (rate limits, server errors, network).
 */
export type ChatErrorKind = "auth" | "balance" | "other";

export interface ChatErrorInfo {
  kind: ChatErrorKind;
  /** Copy to show the user. */
  message: string;
}

export const AUTH_ERROR_MESSAGE =
  "Your Nexus API key is no longer valid. Log in again to keep chatting.";
export const BALANCE_ERROR_MESSAGE =
  "Your Nexus account is out of credit. Recharge it to keep chatting.";
export const RATE_LIMIT_ERROR_MESSAGE =
  "Nexus is rate-limiting this account. Wait a moment and try again.";
export const NETWORK_ERROR_MESSAGE =
  "Could not reach Nexus. Check your connection and try again.";

// Matched as substrings against the error body's `type` and `code`, so a
// spelling we have not seen ("api_key_revoked", "insufficient_credits", ...)
// still lands in the right bucket.
const BALANCE_HINTS = [
  "insufficient_balance",
  "insufficient_credit",
  "insufficient_fund",
  "insufficient_quota",
  "payment_required",
  "billing",
];
const AUTH_HINTS = [
  "authentication",
  "permission",
  "api_key",
  "apikey",
  "access_token",
  "unauthorized",
];
const RATE_LIMIT_HINTS = ["rate_limit", "too_many_requests"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function tag(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : undefined;
}

/**
 * Nexus speaks the OpenAI-compatible error shape,
 * `{ error: { type, code, message } }`, but the fields reach us in several
 * forms: parsed onto `APICallError.data`, only as the raw `responseBody`
 * string, or flattened to the top level. Read all of them, tolerating bodies
 * that carry none.
 */
function nexusErrorFields(error: unknown): {
  type?: string;
  code?: string;
  message?: string;
} {
  const source = asRecord(error);
  if (!source) return {};

  const records: Record<string, unknown>[] = [];
  for (const candidate of [source.data, source.responseBody, source.error]) {
    const record = toRecord(candidate);
    if (!record) continue;
    records.push(record);
    const nested = toRecord(record.error);
    if (nested) records.push(nested);
  }

  const fields: { type?: string; code?: string; message?: string } = {};
  for (const record of records) {
    fields.type ??= tag(record.type);
    fields.code ??= tag(record.code);
    if (fields.message === undefined && typeof record.message === "string") {
      const message = record.message.trim();
      if (message) fields.message = message;
    }
  }
  return fields;
}

function matches(hints: string[], values: (string | undefined)[]): boolean {
  return values.some(
    (value) =>
      value !== undefined && hints.some((hint) => value.includes(hint)),
  );
}

/**
 * Turn a failed chat run into a kind plus user-facing copy.
 *
 * The error body's `type`/`code` win over the HTTP status: Nexus rejects a
 * run with `insufficient_balance` under assorted statuses, and treating that
 * as an expired key would revoke a perfectly good key without fixing
 * anything. Statuses are the fallback for bodies that say nothing, which
 * keeps the plain-401 case working.
 */
export function classifyChatError(error: unknown): ChatErrorInfo {
  const { type, code, message } = nexusErrorFields(error);
  const tags = [type, code];
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;

  // 402 counts as a balance hint rather than waiting its turn among the
  // statuses: a body that says "payment required" in auth-ish words would
  // otherwise classify as auth and cost the user a working key.
  if (matches(BALANCE_HINTS, tags) || status === 402)
    return { kind: "balance", message: BALANCE_ERROR_MESSAGE };
  if (matches(AUTH_HINTS, tags))
    return { kind: "auth", message: AUTH_ERROR_MESSAGE };
  if (matches(RATE_LIMIT_HINTS, tags))
    return { kind: "other", message: RATE_LIMIT_ERROR_MESSAGE };

  // 401: revoked or unknown key. 403: the key exists but may not use this
  // account/model — a freshly provisioned one is the user's way out.
  if (status === 401 || status === 403)
    return { kind: "auth", message: AUTH_ERROR_MESSAGE };
  if (status === 429)
    return { kind: "other", message: RATE_LIMIT_ERROR_MESSAGE };

  // fetch() rejects with a TypeError for a dropped connection or a blocked
  // CORS preflight; "Failed to fetch" on its own tells the user nothing, and
  // a self-hosted Nexus makes both plausible.
  if (error instanceof TypeError)
    return { kind: "other", message: NETWORK_ERROR_MESSAGE };

  return {
    kind: "other",
    message:
      message ?? (error instanceof Error ? error.message : String(error)),
  };
}
