import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream";
import { useEvmlTag } from "@evmcrispr/editor";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  clearAnthropicApiKey,
  getAnthropicApiKey,
  saveAnthropicApiKey,
} from "../utils";
import { createChatTools } from "./tools";

const SYSTEM_PROMPT = `You are an assistant embedded in the EVMcrispr terminal, a web editor for EVML — a scripting language for batching EVM transactions. EVML scripts are line-based: commands like "switch <chain>", "load <module>", "set $var <value>", "exec <target> <signature> <args...>", module commands like "token:transfer", and inline helpers like @token(WETH), @me, @date(now). Comments start with #.

The user's script lives in the Monaco editor next to this chat; you do not receive it automatically. Use get_script to read it, edit_script/write_script to change it (your edits appear live and the user can undo them), validate_script to check it, and simulate_script to dry-run it on a fork. Edit results already include validation diagnostics — fix any errors they report before finishing. Keep replies short; the script itself is the deliverable.

You can also read on-chain data: pass a throwaway script to simulate_script's script parameter and the output of any "print" commands appears in the simulation logs, without touching the editor. Helpers compose with space-separated arguments, so e.g. "print @token.format(ETH @token.balance(ETH @ens(vitalik.eth)))" answers "what is vitalik.eth's ETH balance" with a human-readable string like "1.5 ETH". Use this whenever the user asks about balances, resolved names/addresses, or any other value a helper can compute.`;

export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "tool"; text: string };

export function useChatAgent() {
  const tag = useEvmlTag();

  const [apiKey, setApiKeyState] = useState<string | null>(() =>
    getAnthropicApiKey(),
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<Anthropic.Beta.BetaMessageParam[]>([]);
  const streamRef = useRef<BetaMessageStream | null>(null);
  const stoppedRef = useRef(false);

  const client = useMemo(
    () =>
      apiKey ? new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) : null,
    [apiKey],
  );
  const tools = useMemo(() => createChatTools(tag), [tag]);

  const setApiKey = useCallback((key: string) => {
    saveAnthropicApiKey(key);
    setApiKeyState(key);
    setError(null);
  }, []);

  const clearApiKey = useCallback(() => {
    clearAnthropicApiKey();
    setApiKeyState(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!client || isRunning || !text.trim()) return;

      setError(null);
      setIsRunning(true);
      stoppedRef.current = false;
      setItems((prev) => [...prev, { role: "user", text }]);
      historyRef.current.push({ role: "user", content: text });

      const runner = client.beta.messages.toolRunner({
        model: "claude-opus-4-8",
        max_tokens: 64000,
        max_iterations: 25,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        tools,
        messages: historyRef.current,
        stream: true,
      });

      try {
        for await (const messageStream of runner) {
          streamRef.current = messageStream;
          let started = false;
          for await (const event of messageStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const delta = event.delta.text;
              if (!started) {
                started = true;
                setItems((prev) => [
                  ...prev,
                  { role: "assistant", text: delta },
                ]);
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
            } else if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              started = false;
              const toolName = event.content_block.name;
              setItems((prev) => [...prev, { role: "tool", text: toolName }]);
            }
          }
          if (stoppedRef.current) break;
        }
        // The runner accumulates assistant turns and tool results into its
        // params as it executes; carry that over for the next user message.
        historyRef.current = [...runner.params.messages];
      } catch (e) {
        if (!stoppedRef.current) {
          if (e instanceof Anthropic.AuthenticationError) {
            setError(
              "Invalid API key. Enter a valid Anthropic API key to continue.",
            );
          } else {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        streamRef.current = null;
        setIsRunning(false);
      }
    },
    [client, isRunning, tools],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.abort();
  }, []);

  return {
    hasKey: apiKey !== null,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
    send,
    stop,
  };
}
