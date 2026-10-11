import {
  createContractTools,
  createDocTools,
  createScriptTools,
  createWebTools,
  useChatAgent,
  withClock,
} from "@evmcrispr/ai";
import { useEvmlTag } from "@evmcrispr/editor";
import { toast } from "@repo/ui";
import { getChainId, getConnection } from "@wagmi/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Address } from "viem";
import { useApp } from "../app/AppContext";
import { useUi } from "../app/ui-store";
import { EVMCRISPR_API_BASE } from "../config/api";
import { config as wagmiConfig } from "../config/wagmi";
import { lockNames } from "../storage/locks";
import { guardTools } from "./guard";
import { createAssistantHost } from "./host";
import { SYSTEM_PROMPT } from "./prompt";

type Agent = ReturnType<typeof useChatAgent>;

/** The built-in assistant as the views use it. */
export interface Assistant
  extends Omit<Agent, "send" | "regenerate" | "deleteChat"> {
  /** Sends a message about the space on screen in this tab. */
  send(text: string): void;
  regenerate(): void;
  deleteChat(id: string): void;
  /** The open chat is being answered in another tab. */
  busyElsewhere: boolean;
}

const AssistantContext = createContext<Assistant | null>(null);

export function useAssistant(): Assistant {
  const assistant = useContext(AssistantContext);
  if (!assistant)
    throw new Error("useAssistant must be used inside <AssistantProvider>");
  return assistant;
}

const RECHECK_MS = 1000;

/** One assistant for the app, above the layouts and the route: its chat,
 *  and a turn in flight, outlive a change of space and a change of layout.
 *  Chats belong to the browser; a message carries the space that was on
 *  screen when it was sent, and the turn works there. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { spaces, chats, locks, assistantEvml } = useApp();
  const tag = useEvmlTag();

  const host = useMemo(
    () =>
      createAssistantHost({
        spaces,
        tag,
        // In the assistant's worker, so a heavy fork cannot freeze the
        // page. `simulate` takes an address to run from and no wallet:
        // nothing the assistant runs can sign or send.
        simulate: (script, { from, blockNumber }) =>
          assistantEvml()
            .script(script)
            .simulate({
              from:
                (from as Address | undefined) ??
                getConnection(wagmiConfig).address,
              blockNumber,
            }),
      }),
    [spaces, tag, assistantEvml],
  );
  // Every tool, whatever it is, behind the one guard.
  const tools = useMemo(
    () =>
      guardTools(
        {
          ...createScriptTools(host.tools),
          ...createDocTools(),
          ...createContractTools(() => getChainId(wagmiConfig)),
          ...createWebTools(EVMCRISPR_API_BASE),
        },
        {
          turn: host.turn,
          known: () => new Set(spaces.index.getState().map((meta) => meta.id)),
          chats,
        },
      ),
    [host, spaces, chats],
  );

  // One turn at a time per chat, across tabs. The chats this tab holds
  // are remembered, to tell "answering here" from "answering elsewhere".
  const holding = useRef(new Set<string>());
  const [released, setReleased] = useState(0);
  const acquireTurn = useCallback(
    async (chatId: string) => {
      const release = await locks.tryHold(lockNames.chat(chatId));
      if (!release) return null;
      holding.current.add(chatId);
      try {
        // What another tab answered may not have been announced yet.
        await chats.refresh(chatId);
      } catch (error) {
        // Not answering after all: the chat is given back.
        release();
        holding.current.delete(chatId);
        throw error;
      }
      // Given back once what the turn saved is in storage, where the next
      // tab to answer reads it.
      return () =>
        void chats.flushed().finally(() => {
          release();
          holding.current.delete(chatId);
          setReleased((n) => n + 1);
        });
    },
    [locks, chats],
  );

  const agent = useChatAgent({
    systemPrompt: () => withClock(SYSTEM_PROMPT),
    tools,
    chatStore: chats,
    initialChatId: "latest",
    acquireTurn,
    onTurnStart: host.beginTurn,
    onTurnEnd: ({ id }) => host.endTurn(id),
  });

  const chatId = agent.conversationId;
  const [busyElsewhere, setBusyElsewhere] = useState(false);
  // Asked again when a chat is saved anywhere, when a turn of this tab
  // ends or is refused, and every second while the answer is yes.
  useEffect(() => {
    void released;
    void agent.error;
    let live = true;
    const check = async () => {
      const held =
        !holding.current.has(chatId) &&
        (await locks.isHeld(lockNames.chat(chatId)));
      if (live) setBusyElsewhere(held);
    };
    void check();
    const stop = chats.subscribe(() => void check());
    const timer = busyElsewhere ? setInterval(check, RECHECK_MS) : undefined;
    return () => {
      live = false;
      stop();
      clearInterval(timer);
    };
  }, [chatId, locks, chats, busyElsewhere, released, agent.error]);

  // A revision's row asks for the chat that produced it.
  const chatRequest = useUi((s) => s.chatRequest);
  const { openChat } = agent;
  useEffect(() => {
    if (chatRequest) openChat(chatRequest.chatId);
  }, [chatRequest, openChat]);

  const { send, regenerate, deleteChat } = agent;
  const value = useMemo<Assistant>(() => {
    const here = () => ({ scope: spaces.onScreen.getState() ?? undefined });
    return {
      ...agent,
      busyElsewhere,
      send: (text) => void send(text, here()),
      regenerate: () => regenerate(here()),
      // A chat being answered, here or in another tab, is not removed
      // from under its turn: the turn would save it again.
      deleteChat: async (id) => {
        const release = await locks.tryHold(lockNames.chat(id));
        if (!release) {
          toast("This chat is being answered. Try again when it is done.");
          return;
        }
        deleteChat(id);
        void chats.flushed().finally(release);
      },
    };
  }, [
    agent,
    busyElsewhere,
    send,
    regenerate,
    deleteChat,
    spaces,
    locks,
    chats,
  ]);

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}
