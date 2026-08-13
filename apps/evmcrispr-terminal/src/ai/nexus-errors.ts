import { APICallError } from "ai";

import { clearNexusApiKey } from "../utils";

/**
 * What a failed chat run means for the user, which decides what they can do
 * about it: log in again, top up, or just retry.
 */
export type ChatErrorKind = "auth" | "balance" | "other";

export interface ChatError {
  kind: ChatErrorKind;
  message: string;
}

/**
 * The fields Nexus (like any OpenAI-compatible API) puts on an error body,
 * all optional: plenty of failures arrive as plain text, HTML from a proxy,
 * or no body at all.
 */
interface ErrorFields {
  type?: string;
  code?: string;
  message?: string;
}

// A dead key: re-login is the only fix. `permission_error` covers a key that
// was revoked or disabled on the Nexus side.
const AUTH_MARKERS = [
  "authentication_error",
  "permission_error",
  "invalid_api_key",
  "invalid_authentication",
  "api_key_expired",
  "api_key_revoked",
  "unauthorized",
];
// An empty wallet, not a bad key — clearing the key here would send the user
// through a login that cannot possibly help.
const BALANCE_MARKERS = [
  "insufficient_balance",
  "insufficient_quota",
  "insufficient_credit",
  "billing_hard_limit_reached",
];
const RATE_LIMIT_MARKERS = ["rate_limit_error", "rate_limit_exceeded"];

const AUTH_MESSAGE =
  "Your Nexus API key is no longer valid. Log in again to keep chatting.";
const BALANCE_MESSAGE =
  "Your Nexus account has run out of credit, so the request was rejected.";
const RATE_LIMIT_MESSAGE =
  "Nexus is rate limiting this account. Wait a moment and try again.";
const NETWORK_MESSAGE =
  "Could not reach Nexus. Check your connection and try again.";

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Digs `type`/`code`/`message` out of an error body, accepting both the
 * OpenAI-compatible `{ error: {...} }` envelope and a flat object, from
 * either the provider's parsed `data` or the raw response text.
 */
function errorFields(e: APICallError): ErrorFields {
  const candidates: unknown[] = [e.data];
  if (e.responseBody) {
    try {
      candidates.push(JSON.parse(e.responseBody));
    } catch {
      // Not JSON (proxy HTML, plain text): the status code decides.
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const outer = candidate as Record<string, unknown>;
    const inner =
      typeof outer.error === "object" && outer.error !== null
        ? (outer.error as Record<string, unknown>)
        : outer;
    const fields: ErrorFields = {
      type: str(inner.type),
      code: str(inner.code),
      message: str(inner.message),
    };
    if (fields.type || fields.code || fields.message) return fields;
  }
  return {};
}

function matches(fields: ErrorFields, markers: string[]): boolean {
  // Only the machine-readable fields are matched; a free-form message is too
  // easy to trip over (an assistant quoting "invalid_api_key", say).
  const haystack = `${fields.type ?? ""} ${fields.code ?? ""}`.toLowerCase();
  return markers.some((marker) => haystack.includes(marker));
}

/**
 * Turns whatever a failed run threw into a message and a kind. Body fields
 * win when present; the status code is the fallback for bodies that carry
 * neither (including the bare 401 this used to be the only case for).
 */
export function classifyChatError(e: unknown): ChatError {
  if (APICallError.isInstance(e)) {
    const fields = errorFields(e);

    // Balance first: Nexus reports insufficient_balance with an auth-ish
    // status on some plans, and re-login cannot refill an empty account.
    if (matches(fields, BALANCE_MARKERS) || e.statusCode === 402)
      return { kind: "balance", message: BALANCE_MESSAGE };
    if (matches(fields, AUTH_MARKERS))
      return { kind: "auth", message: AUTH_MESSAGE };
    if (matches(fields, RATE_LIMIT_MARKERS))
      return { kind: "other", message: RATE_LIMIT_MESSAGE };
    if (e.statusCode === 401 || e.statusCode === 403)
      return { kind: "auth", message: AUTH_MESSAGE };
    if (e.statusCode === 429)
      return { kind: "other", message: RATE_LIMIT_MESSAGE };

    return { kind: "other", message: fields.message ?? e.message };
  }

  // fetch() rejects with a TypeError for a dropped connection or a blocked
  // CORS preflight; "Failed to fetch" on its own tells the user nothing.
  if (e instanceof TypeError)
    return { kind: "other", message: NETWORK_MESSAGE };

  return {
    kind: "other",
    message: e instanceof Error ? e.message : String(e),
  };
}

/**
 * Classifies a failed run and, when the stored key is what failed, drops it
 * so the chat falls back to the login screen instead of an error the user
 * cannot act on. The OAuth session is deliberately kept: only the key is
 * dead, and loginWithNexus() revokes and re-provisions one anyway.
 */
export function handleChatError(e: unknown): ChatError {
  const error = classifyChatError(e);
  if (error.kind === "auth") clearNexusApiKey();
  return error;
}
