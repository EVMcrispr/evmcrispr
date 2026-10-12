import type { ChatTurn } from "@evmcrispr/ai";
import type { ToolSet } from "ai";
import type { IdbChatStore } from "./chat-store";
import { permit, toolKind } from "./permit";

export interface GuardDeps {
  /** The turn being answered, with the space its message was sent from. */
  turn(): ChatTurn | null;
  /** The user's own spaces, as the registry lists them now. */
  known(): ReadonlySet<string>;
  /** Read, and noted with what a chat takes in. The guard has no way to
   *  record an answer: that is the user's click (`grant`), elsewhere. */
  chats: Pick<IdbChatStore, "getPermissions" | "noteTaken">;
}

const NEEDED =
  "The user's permission is needed for this, and they have been asked in the chat. Nothing was done. Say in one sentence what you wanted to do and stop; do not try another way.";

/** Every tool call of the assistant passes here before it runs, each
 *  time: `permit` decides from what the chat has taken in and what the
 *  user allowed it. What a call takes in is noted before it runs, in the
 *  same tick as the decision, so calls made together see each other. */
export function guardTools(tools: ToolSet, deps: GuardDeps): ToolSet {
  const guarded: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const { execute } = tool;
    if (!execute) {
      guarded[name] = tool;
      continue;
    }
    guarded[name] = {
      ...tool,
      execute: async (input: unknown, options: never) => {
        const turn = deps.turn();
        const state = turn && deps.chats.getPermissions(turn.chatId);
        // Outside a turn, or in a chat that is not kept, nothing runs:
        // there would be nowhere to note what it took in.
        if (!turn || !state) return { error: "No message is being answered." };
        const verdict = permit(state, {
          ...toolKind(name, input),
          named: (input as { space?: unknown } | null)?.space,
          scope: turn.scope,
          known: deps.known(),
        });
        if (!verdict.allow)
          return "ask" in verdict
            ? { kind: "permission", ...verdict.ask, error: NEEDED }
            : { error: verdict.error };
        deps.chats.noteTaken(turn.chatId, verdict.state);
        return execute(input as never, options);
      },
    } as ToolSet[string];
  }
  return guarded;
}
