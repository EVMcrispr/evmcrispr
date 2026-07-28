import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { useEvmlTag } from "@evmcrispr/editor";
import { APICallError, type ModelMessage, stepCountIs, streamText } from "ai";
import { useCallback, useMemo, useRef, useState } from "react";

import { clearNexusApiKey, getNexusApiKey, saveNexusApiKey } from "../utils";
import { createChatTools } from "./tools";

const NEXUS_BASE_URL = "https://nexus-api.dappnode.com/v1";
const MODEL = "moonshotai/kimi-k3";

// Nexus's CORS preflight allows only these request headers; the SDK also
// sets a (non-safelisted) user-agent, which makes browsers fail the whole
// preflight, so strip anything else before sending.
const ALLOWED_HEADERS = ["authorization", "content-type", "x-request-id"];
// Cast: bun's fetch type carries an extra preconnect property.
const corsSafeFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  for (const name of [...headers.keys()])
    if (!ALLOWED_HEADERS.includes(name)) headers.delete(name);
  return fetch(input, { ...init, headers });
}) as typeof fetch;

const SYSTEM_PROMPT = `You are an assistant embedded in the EVMcrispr terminal, a web editor for EVML — a scripting language for batching EVM transactions. EVML scripts are line-based: commands like "switch <chain>", "load <module>", "set $var <value>", "exec <target> <signature> <args...>", module commands like "token:transfer", and inline helpers like @token(WETH), @me, @date(now). Comments start with #.

The user's script lives in the Monaco editor next to this chat; you do not receive it automatically. Use get_script to read it, edit_script/write_script to change it (your edits appear live and the user can undo them), validate_script to check it, and simulate_script to dry-run it on a fork. Edit results already include validation diagnostics — fix any errors they report before finishing. Keep replies short; the script itself is the deliverable.

You have the full EVML reference at hand: list_modules gives an overview of every module, describe_module lists a module's commands and helpers, and get_docs returns the full documentation of one command or helper (syntax, arguments, options, examples). Look up anything you are not certain about instead of guessing — especially before using a module command's options or a helper's argument order.

You can also read on-chain data: pass a throwaway script to simulate_script's script parameter and the output of any "print" commands appears in the simulation logs, without touching the editor. Helpers compose with space-separated arguments, so e.g. "load token" followed by "print @token:format(ETH @token:balance(ETH @ens(vitalik.eth)))" answers "what is vitalik.eth's ETH balance" with a human-readable string like "1.5 ETH". Use this whenever the user asks about balances, resolved names/addresses, or any other value a helper can compute.`;

export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "tool"; text: string };

export function useChatAgent() {
  const tag = useEvmlTag();

  const [apiKey, setApiKeyState] = useState<string | null>(() =>
    getNexusApiKey(),
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

  const historyRef = useRef<ModelMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const model = useMemo(
    () =>
      apiKey
        ? createOpenAICompatible({
            name: "nexus",
            baseURL: NEXUS_BASE_URL,
            apiKey,
            fetch: corsSafeFetch,
          })(MODEL)
        : null,
    [apiKey],
  );
  const tools = useMemo(() => createChatTools(tag), [tag]);

  const setApiKey = useCallback((key: string) => {
    saveNexusApiKey(key);
    setApiKeyState(key);
    setError(null);
    setIsAuthError(false);
  }, []);

  const clearApiKey = useCallback(() => {
    clearNexusApiKey();
    setApiKeyState(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!model || isRunning || !text.trim()) return;

      setError(null);
      setIsAuthError(false);
      setIsRunning(true);
      stoppedRef.current = false;
      setItems((prev) => [...prev, { role: "user", text }]);
      historyRef.current.push({ role: "user", content: text });

      const abort = new AbortController();
      abortRef.current = abort;

      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: historyRef.current,
        tools,
        // Nexus reserves the full max_tokens cost upfront and rejects the
        // request with insufficient_balance when the cap exceeds the
        // account balance, so an explicit modest cap is required.
        maxOutputTokens: 16384,
        stopWhen: stepCountIs(25),
        abortSignal: abort.signal,
      });

      try {
        let started = false;
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            const delta = part.text;
            if (!started) {
              started = true;
              setItems((prev) => [...prev, { role: "assistant", text: delta }]);
            } else {
              setItems((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant")
                  next[next.length - 1] = {
                    role: "assistant",
                    text: last.text + delta,
                  };
                return next;
              });
            }
          } else if (part.type === "tool-call") {
            started = false;
            setItems((prev) => [
              ...prev,
              { role: "tool", text: part.toolName },
            ]);
          } else if (part.type === "error") {
            throw part.error;
          }
        }
        // Carry the assistant and tool turns over for the next user message.
        // (result.response only covers the final step; responseMessages
        // flattens every step's assistant/tool messages.)
        historyRef.current.push(...(await result.responseMessages));
      } catch (e) {
        console.error("[chat] agent error", e);
        if (!stoppedRef.current) {
          if (APICallError.isInstance(e) && e.statusCode === 401) {
            setError("Invalid API key.");
            setIsAuthError(true);
          } else {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        abortRef.current = null;
        setIsRunning(false);
      }
    },
    [model, isRunning, tools],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  return {
    hasKey: apiKey !== null,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
    isAuthError,
    send,
    stop,
  };
}
