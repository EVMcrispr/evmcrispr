import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  AUTH_ERROR_MESSAGE,
  BALANCE_ERROR_MESSAGE,
  BUSY_ERROR_MESSAGE,
  type ChatItem,
  type UseChatAgentOptions,
  useChatAgent,
} from "@evmcrispr/ai";
import { act, renderHook } from "@testing-library/react";
import { createIdbChatStore } from "../../src/assistant/chat-store";
import { createChanges } from "../../src/storage/changes";
import { memoryRecords } from "../../src/storage/records";
import { channelHub, settle } from "../helpers/tabs";

const API_KEY_STORAGE_KEY = "evmcrispr:nexusApiKey";

// A stand-in Nexus. Only the socket is faked: the provider still parses these
// responses, so `streamText` fails with the same `APICallError` the live
// gateway produces and the hook's real error path runs.
let respond: () => Response = () => new Response("{}");
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => respond()) as unknown as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

function rejection(status: number, error: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderAgent(options: Partial<UseChatAgentOptions> = {}) {
  return renderHook(() =>
    useChatAgent({
      systemPrompt: "test",
      tools: {},
      maxSteps: 1,
      ...options,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(API_KEY_STORAGE_KEY, "nexus-key");
});

describe("useChatAgent auth recovery", () => {
  test("an auth failure drops the key so the host can offer a fresh login", async () => {
    respond = () =>
      rejection(401, {
        message: "API key not found",
        type: "authentication_error",
        code: "invalid_api_key",
      });

    const { result } = renderAgent();
    expect(result.current.hasKey).toBe(true);

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(false);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
    expect(result.current.error).toEqual({
      kind: "auth",
      message: AUTH_ERROR_MESSAGE,
    });
  });

  test("an empty balance keeps the key and says so", async () => {
    respond = () =>
      // Re-logging in would revoke a working key and buy no credit.
      rejection(403, {
        message: "Insufficient balance to reserve output tokens",
        type: "insufficient_balance",
        code: "insufficient_balance",
      });

    const { result } = renderAgent();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(true);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe("nexus-key");
    expect(result.current.error).toEqual({
      kind: "balance",
      message: BALANCE_ERROR_MESSAGE,
    });
  });

  test("an unrelated failure keeps the key and its own message", async () => {
    respond = () =>
      rejection(400, {
        message: "model `kimi-k9` does not exist",
        type: "invalid_request_error",
      });

    const { result } = renderAgent();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.hasKey).toBe(true);
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe("nexus-key");
    expect(result.current.error).toEqual({
      kind: "other",
      message: "model `kimi-k9` does not exist",
    });
  });

  test("clearApiKey leaves no banner behind", async () => {
    respond = () =>
      rejection(403, {
        message: "Insufficient balance",
        code: "insufficient_balance",
      });

    const { result } = renderAgent();
    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearApiKey();
    });

    expect(result.current.hasKey).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("reports the start and the end of a turn, also when it fails", async () => {
    respond = () =>
      rejection(401, {
        message: "API key not found",
        type: "authentication_error",
        code: "invalid_api_key",
      });
    const seen: string[] = [];
    const { result } = renderAgent({
      onTurnStart: (turn) => seen.push(`start ${turn.id} ${turn.chatId}`),
      onTurnEnd: (turn) => seen.push(`end ${turn.id} ${turn.stopped}`),
    });
    const chatId = result.current.conversationId;

    await act(async () => {
      await result.current.send("hello");
    });

    expect(seen.length).toBe(2);
    const turnId = seen[0].split(" ")[1];
    expect(seen[0]).toBe(`start ${turnId} ${chatId}`);
    expect(seen[1]).toBe(`end ${turnId} false`);
  });
});

const unauthorized = () =>
  rejection(401, {
    message: "API key not found",
    type: "authentication_error",
    code: "invalid_api_key",
  });
// A turn that fails without costing the key, so several can follow.
const failing = () =>
  rejection(400, { message: "nope", type: "invalid_request_error" });
const said = (text: string): ChatItem[] => [{ role: "user", text }];

/** Chat stores of one browser, each a tab's. */
function browser() {
  const records = memoryRecords();
  const hub = channelHub();
  return async () => {
    const store = createIdbChatStore({ records, changes: createChanges(hub) });
    await store.ready;
    return store;
  };
}

describe("useChatAgent and the chats it keeps", () => {
  test("the last chat reopens, not the most recent one", async () => {
    const store = await browser()();
    store.saveChat("older", "Older", said("first"), [
      { role: "user", content: "first" },
    ]);
    await settle();
    store.saveChat("newer", "Newer", said("second"), []);
    store.setLastChatId("older");

    const { result } = renderAgent({
      chatStore: store,
      initialChatId: "latest",
    });
    expect(result.current.conversationId).toBe("older");
    expect(result.current.items).toEqual(said("first"));
  });

  test("without a last chat the most recent one opens; with none, a new one", async () => {
    const store = await browser()();
    const fresh = renderAgent({ chatStore: store, initialChatId: "latest" });
    expect(fresh.result.current.items).toEqual([]);

    store.saveChat("only", "Only", said("hi"), []);
    store.setLastChatId("removed-since");
    const { result } = renderAgent({
      chatStore: store,
      initialChatId: "latest",
    });
    expect(result.current.conversationId).toBe("only");
  });

  test("a new chat has an empty context, and what was open stays stored", async () => {
    const store = await browser()();
    store.saveChat("c1", "One", said("hi"), []);
    const { result } = renderAgent({
      chatStore: store,
      initialChatId: "latest",
    });
    act(() => result.current.newChat());
    expect(result.current.items).toEqual([]);
    expect(result.current.conversationId).not.toBe("c1");
    expect(store.getChat("c1")?.items).toEqual(said("hi"));
  });

  test("a message carries where it was sent from, and a chat is labelled with where it started", async () => {
    respond = failing;
    const store = await browser()();
    const turns: unknown[] = [];
    const { result } = renderAgent({
      chatStore: store,
      onTurnStart: (turn) => turns.push(["start", turn.scope]),
      onTurnEnd: (turn) => turns.push(["end", turn.scope]),
    });
    await act(async () => {
      await result.current.send("hi", { scope: "space-1" });
    });
    await act(async () => {
      await result.current.send("and here", { scope: "space-2" });
    });
    expect(turns).toEqual([
      ["start", "space-1"],
      ["end", "space-1"],
      ["start", "space-2"],
      ["end", "space-2"],
    ]);
    const [meta] = store.listChats();
    expect(meta.id).toBe(result.current.conversationId);
    expect(meta.scopeId).toBe("space-1");
    expect(store.getLastChatId()).toBe(meta.id);
  });

  test("one turn at a time: a chat answering elsewhere takes no message", async () => {
    respond = unauthorized;
    const store = await browser()();
    const seen: string[] = [];
    const asked: string[] = [];
    const { result } = renderAgent({
      chatStore: store,
      acquireTurn: async (chatId) => {
        asked.push(chatId);
        return null;
      },
      onTurnStart: () => seen.push("start"),
      onTurnEnd: () => seen.push("end"),
    });
    await act(async () => {
      await result.current.send("hello");
    });
    expect(asked).toEqual([result.current.conversationId]);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toEqual({
      kind: "busy",
      message: BUSY_ERROR_MESSAGE,
    });
    expect(seen).toEqual([]);
    expect(store.listChats()).toEqual([]);
    // Nothing was sent, so the key was not judged.
    expect(result.current.hasKey).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  test("the right to answer is held for the turn and given back when it ends", async () => {
    respond = failing;
    const order: string[] = [];
    const { result } = renderAgent({
      acquireTurn: async () => {
        order.push("acquired");
        return () => order.push("released");
      },
      onTurnStart: () => order.push("start"),
      onTurnEnd: () => order.push("end"),
    });
    await act(async () => {
      await result.current.send("hello");
    });
    expect(order).toEqual(["acquired", "start", "end", "released"]);
  });

  test("the open chat follows what another tab saves, and a chat removed there closes here", async () => {
    const tab = browser();
    const [mine, other] = [await tab(), await tab()];
    mine.saveChat("c1", "One", said("hi"), []);
    await mine.flushed();
    await settle();
    const { result } = renderAgent({ chatStore: mine, initialChatId: "c1" });
    expect(result.current.items).toEqual(said("hi"));

    const longer: ChatItem[] = [
      ...said("hi"),
      { role: "assistant", text: "yo" },
    ];
    await act(async () => {
      other.saveChat("c1", "One", longer, []);
      await other.flushed();
      await settle();
    });
    expect(result.current.conversationId).toBe("c1");
    expect(result.current.items).toEqual(longer);

    await act(async () => {
      other.removeChat("c1");
      await other.flushed();
      await settle();
    });
    expect(result.current.conversationId).not.toBe("c1");
    expect(result.current.items).toEqual([]);
  });

  test("a message sent after another tab answered continues from its answer", async () => {
    respond = failing;
    const tab = browser();
    const [mine, other] = [await tab(), await tab()];
    mine.saveChat("c1", "One", said("hi"), []);
    await mine.flushed();
    await settle();
    const { result } = renderAgent({
      chatStore: mine,
      initialChatId: "c1",
      // What a host does: the chat is read again before the turn starts.
      acquireTurn: async (chatId) => {
        await mine.refresh(chatId);
        return () => {};
      },
    });
    const longer: ChatItem[] = [
      ...said("hi"),
      { role: "assistant", text: "yo" },
    ];
    other.saveChat("c1", "One", longer, []);
    await other.flushed();
    // No time for the announcement: the message is sent at once.
    await act(async () => {
      await result.current.send("and then?");
    });
    expect(result.current.items.slice(0, 3)).toEqual([
      ...longer,
      { role: "user", text: "and then?" },
    ]);
  });

  test("deleting the open chat starts a new one", async () => {
    const store = await browser()();
    store.saveChat("c1", "One", said("hi"), []);
    const { result } = renderAgent({ chatStore: store, initialChatId: "c1" });
    act(() => result.current.deleteChat("c1"));
    expect(store.getChat("c1")).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(result.current.conversationId).not.toBe("c1");
  });

  test("there is no per-edit undo", () => {
    const { result } = renderAgent();
    expect("undoRevision" in result.current).toBe(false);
  });
});
