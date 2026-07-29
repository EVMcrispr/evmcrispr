import { beforeEach, describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";

import {
  deriveTitle,
  getChat,
  listChats,
  removeChat,
  saveChat,
} from "../../src/ai/chat-store";
import type { ChatItem } from "../../src/ai/useChatAgent";

beforeEach(() => {
  localStorage.clear();
});

const items: ChatItem[] = [
  { role: "user", text: "hello" },
  { role: "tool", text: "get_script" },
  { role: "assistant", text: "hi" },
];

// A representative model conversation: user string, assistant with text +
// tool-call parts, and a tool result — the shapes the AI SDK produces.
const messages: ModelMessage[] = [
  { role: "user", content: "hello" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "let me check" },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "get_script",
        input: { some: "arg" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "get_script",
        output: { type: "text", value: "1\tswitch gnosis" },
      },
    ],
  },
];

describe("deriveTitle", () => {
  test("collapses whitespace", () => {
    expect(deriveTitle("  hello\n  world ")).toBe("hello world");
  });

  test("truncates long titles with an ellipsis", () => {
    const title = deriveTitle("x".repeat(100));
    expect(title.length).toBe(60);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("saveChat / getChat / listChats", () => {
  test("round-trips a conversation", () => {
    saveChat("id-1", "hello", items, messages);

    const stored = getChat("id-1");
    expect(stored).not.toBeNull();
    expect(stored?.items).toEqual(items);
    expect(stored?.messages).toEqual(messages);

    const metas = listChats();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe("id-1");
    expect(metas[0].title).toBe("hello");
  });

  test("model messages survive the JSON round-trip deep-equal", () => {
    expect(JSON.parse(JSON.stringify(messages))).toEqual(messages);
  });

  test("upserting bumps updatedAt and keeps createdAt", () => {
    saveChat("id-1", "hello", items, messages);
    const before = listChats()[0];
    saveChat("id-1", "hello again", items, messages);
    const after = listChats()[0];
    expect(listChats()).toHaveLength(1);
    expect(after.title).toBe("hello again");
    expect(after.createdAt).toBe(before.createdAt);
  });

  test("lists most recently updated first", async () => {
    saveChat("id-1", "first", items, messages);
    await new Promise((resolve) => setTimeout(resolve, 5));
    saveChat("id-2", "second", items, messages);
    expect(listChats().map((m) => m.id)).toEqual(["id-2", "id-1"]);
  });

  test("returns null for unknown ids", () => {
    expect(getChat("nope")).toBeNull();
  });
});

describe("pruning", () => {
  test("keeps at most 20 conversations, dropping oldest payloads", async () => {
    for (let i = 0; i < 25; i++) {
      saveChat(`id-${i}`, `chat ${i}`, items, messages);
      // Distinct updatedAt timestamps so pruning order is deterministic.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const metas = listChats();
    expect(metas).toHaveLength(20);
    expect(metas.some((m) => m.id === "id-0")).toBe(false);
    expect(metas.some((m) => m.id === "id-24")).toBe(true);
    // Pruned payload keys are actually removed from storage.
    expect(localStorage.getItem("evmcrispr:chat:id-0")).toBeNull();
    expect(getChat("id-24")).not.toBeNull();
  });
});

describe("removeChat", () => {
  test("removes the meta entry and the payload", () => {
    saveChat("id-1", "hello", items, messages);
    removeChat("id-1");
    expect(listChats()).toHaveLength(0);
    expect(getChat("id-1")).toBeNull();
  });
});
