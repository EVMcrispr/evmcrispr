import {
  createContractTools,
  createDocTools,
  createScriptTools,
  createWebTools,
  type ScriptToolsHost,
  useChatAgent,
  withClock,
} from "@evmcrispr/ai";
import type { EvmlTag } from "@evmcrispr/core";
import { useEvmlTag } from "@evmcrispr/editor";
import { deriveTitle } from "@evmcrispr/space";
import { getChainId, getConnection } from "@wagmi/core";
import { useMemo, useRef } from "react";
import type { Address } from "viem";

import { useApp } from "../app/AppContext";
import { useMaybeSpace } from "../app/SpaceContext";
import { EVMCRISPR_API_BASE } from "../config/api";
import { config as wagmiConfig } from "../config/wagmi";
import { workerEvml } from "../evml/workerEvml";
import type { LiveSpace, ScriptEdit } from "../space/live-space";

const SYSTEM_PROMPT = `You are an assistant embedded in the EVMcrispr terminal, an interface for EVML — a scripting language for batching EVM transactions. EVML scripts are line-based: commands like "switch <chain>", "load <module>", "set $var <value>", "exec <target> <signature> <args...>", module commands like "token:transfer", and inline helpers like @token(WETH), @me, @date(now). Comments start with #.

The user's script is managed by the terminal; you do not receive it automatically. Use get_script to read it, edit_script/write_script to change it, validate_script to check it, and simulate_script to dry-run it on a fork. On phones, chat is the only authoring surface and the script is always read-only. Edit results already include validation diagnostics — fix any errors they report before finishing. The script's title is its first line when that line is a comment ("# Pay the team"). After changing a script, make sure that line still describes it: a few words naming its overall purpose, broad enough that small edits don't call for a rename. Keep replies short; the script itself is the deliverable. Never claim that a transaction was sent: broadcasting always requires a separate user review and wallet confirmation.

You have the full EVML reference at hand: list_modules gives an overview of every module, describe_module lists a module's commands and helpers, and get_docs returns the full documentation of one command or helper (syntax, arguments, options, examples). Look up anything you are not certain about instead of guessing — especially before using a module command's options or a helper's argument order.

You can also read on-chain data: pass a throwaway script to simulate_script's script parameter and the output of any "print" commands appears in the simulation logs, without touching the editor. Helpers compose with space-separated arguments, so e.g. "load token" followed by "print @token:format(ETH @token:balance(ETH @ens(vitalik.eth)))" answers "what is vitalik.eth's ETH balance" with a human-readable string like "1.5 ETH". Use this whenever the user asks about balances, resolved names/addresses, or any other value a helper can compute.

Before writing an exec call against a specific contract, or when the user asks what a contract does, use get_contract to read its verified ABI and source from Etherscan (it flags proxies and lets you read files one by one) instead of guessing function signatures.

For external protocols, or anything the EVML docs tools and get_contract do not cover (e.g. how ENS name wrapping works, a protocol's contract addresses, an unfamiliar function signature), use search_web to find documentation and fetch_page to read it instead of guessing. Prefer official documentation over blogs, and cite the source URLs in your reply.`;

/** The space a turn works on: the one on screen when its message was
 *  sent. A turn that outlives a switch of space keeps its own. */
interface Turn {
  id: string;
  space: LiveSpace;
}

/** The assistant reads the script and hands its edits to the space as
 *  data. It never touches the editor: what it writes is not the user's. */
function createTerminalHost(
  tag: EvmlTag,
  turn: () => Turn | null,
  onScreen: () => LiveSpace | null,
): ScriptToolsHost {
  const target = () => turn()?.space ?? onScreen();
  const edit = (change: ScriptEdit) => {
    const current = turn();
    if (!current)
      return { ok: false as const, error: "No script is currently loaded." };
    return current.space.editAsTurn(current.id, change);
  };
  return {
    tag,
    getScript: () => target()?.getText() ?? "",
    getTitle: () => deriveTitle(target()?.getText() ?? ""),
    applyStrReplace: (oldString, newString) =>
      edit({ kind: "replace", oldString, newString }),
    applyWrite: (text) => edit({ kind: "write", text }),
    // Runs in the EVML worker so a heavy fork simulation (ethereumjs VM)
    // can't freeze the UI while the chat waits on it.
    simulate: (script, { from, blockNumber }) =>
      workerEvml.script(script).simulate({
        from:
          (from as Address | undefined) ?? getConnection(wagmiConfig).address,
        blockNumber,
      }),
  };
}

/** The terminal's chat agent: the headless `@evmcrispr/ai` hook wired to
 *  the space on screen, the EVML worker and the wagmi connection. */
export function useTerminalChatAgent() {
  const tag = useEvmlTag();
  const { spaces } = useApp();
  const space = useMaybeSpace();
  const spaceRef = useRef(space);
  spaceRef.current = space;
  const turnRef = useRef<Turn | null>(null);

  const tools = useMemo(
    () => ({
      ...createScriptTools(
        createTerminalHost(
          tag,
          () => turnRef.current,
          () => spaceRef.current,
        ),
      ),
      ...createDocTools(),
      ...createContractTools(() => getChainId(wagmiConfig)),
      ...createWebTools(EVMCRISPR_API_BASE),
    }),
    [tag],
  );

  return useChatAgent({
    systemPrompt: () => withClock(SYSTEM_PROMPT),
    tools,
    scopeId: space?.id ?? null,
    onTurnStart: ({ id }) => {
      const current = spaceRef.current;
      if (!current) return;
      // Held for the turn: it may end after the user has gone elsewhere.
      void spaces.acquire(current.id);
      turnRef.current = { id, space: current };
    },
    onTurnEnd: ({ id }) => {
      const turn = turnRef.current;
      if (turn?.id !== id) return;
      turnRef.current = null;
      turn.space.endTurn(id);
      spaces.release(turn.space.id);
    },
  });
}
