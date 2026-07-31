import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { type NexusConfig, resolveNexusConfig } from "./config";

// Nexus's CORS preflight allows only these request headers; the AI SDK also
// sets a (non-safelisted) user-agent, which makes browsers fail the whole
// preflight, so strip anything else before sending.
const ALLOWED_HEADERS = ["authorization", "content-type", "x-request-id"];

function corsSafeFetch(fetchImpl: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    for (const name of [...headers.keys()])
      if (!ALLOWED_HEADERS.includes(name)) headers.delete(name);
    return fetchImpl(input, { ...init, headers });
  }) as typeof fetch;
}

/** A chat-completion `LanguageModel` backed by a Nexus API key, or `null`
 *  when no key is configured yet. */
export function createNexusModel(
  apiKey: string | null,
  config?: Partial<NexusConfig>,
): LanguageModel | null {
  if (!apiKey) return null;
  const resolved = resolveNexusConfig(config);
  return createOpenAICompatible({
    name: "nexus",
    baseURL: resolved.baseURL,
    apiKey,
    fetch: corsSafeFetch(fetch),
  })(resolved.model);
}
