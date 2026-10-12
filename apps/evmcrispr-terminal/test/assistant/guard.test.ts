import { beforeEach, expect, test } from "bun:test";
import { createScriptTools } from "@evmcrispr/ai";
import type { EvmlTag } from "@evmcrispr/core";
import { revisions } from "@evmcrispr/space";
import { tool } from "ai";
import { z } from "zod";
import type { App } from "../../src/app/boot";
import { guardTools } from "../../src/assistant/guard";
import {
  type AssistantHost,
  createAssistantHost,
} from "../../src/assistant/host";
import { testBrowser } from "../helpers/app";

const tag = {
  script: () => ({ validate: async () => ({ valid: true, diagnostics: [] }) }),
} as unknown as EvmlTag;

let app: App;
let host: AssistantHost;
let fetched: string[];
let simulated: string[];
let run: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
let A: string;
let B: string;
let C: string;

const text = async (id: string) => {
  const space = (await app.spaces.acquire(id))!;
  try {
    return space.getText();
  } finally {
    app.spaces.release(id);
  }
};
const edit = (space?: string) =>
  run("write_script", {
    content: "changed",
    explanation: "Changed it.",
    ...(space === undefined ? {} : { space }),
  });
const ASK_WEB = { kind: "permission", what: "web" };
const askEdit = (space: string) => ({
  kind: "permission",
  what: "edit",
  space,
});

beforeEach(async () => {
  app = testBrowser().tab();
  await app.chats.ready;
  fetched = [];
  simulated = [];
  host = createAssistantHost({
    spaces: app.spaces,
    tag,
    simulate: async (script) => {
      simulated.push(script);
      return { success: true, logs: [], actions: [] };
    },
  });
  const tools = guardTools(
    {
      ...createScriptTools(host.tools),
      fetch_page: tool({
        inputSchema: z.object({ url: z.string() }),
        execute: async ({ url }) => {
          fetched.push(url);
          return "a page";
        },
      }),
      get_docs: tool({
        inputSchema: z.object({}),
        execute: async () => "docs",
      }),
    },
    {
      turn: host.turn,
      known: () => new Set(app.spaces.index.getState().map((m) => m.id)),
      chats: app.chats,
    },
  );
  const callable = tools as unknown as Record<
    string,
    { execute(input: unknown, options: unknown): Promise<unknown> }
  >;
  run = (name, input = {}) =>
    callable[name].execute(input, { toolCallId: "call", messages: [] });
  [A, B, C] = [
    await app.spaces.create({ text: "in a", source: "user" }),
    await app.spaces.create({ text: "in b", source: "user" }),
    await app.spaces.create({ text: "in c", source: "user" }),
  ];
  app.chats.saveChat("chat", "Chat", [{ role: "user", text: "hi" }], []);
  host.beginTurn({ id: "t1", chatId: "chat", scope: A });
});

test("the space the message was sent from is read and edited without asking, with the web too", async () => {
  expect(await run("fetch_page", { url: "https://x" })).toBe("a page");
  expect(await run("get_script")).toContain("in a");
  expect(await edit()).toMatchObject({ kind: "script-change", ok: true });
  expect(await run("simulate_script")).toMatchObject({ kind: "simulation" });
  expect(await text(A)).toBe("changed");
});

test("an edit to another space writes nothing until the user allows that space, and then only that one", async () => {
  expect(await edit(B)).toMatchObject(askEdit(B));
  host.endTurn("t1");
  expect(await text(B)).toBe("in b");

  app.chats.grant("chat", { edit: B });
  host.beginTurn({ id: "t2", chatId: "chat", scope: A });
  expect(await edit(C)).toMatchObject(askEdit(C));
  expect(await edit(B)).toMatchObject({ kind: "script-change", ok: true });
  host.endTurn("t2");
  expect(await text(B)).toBe("changed");
  expect(await text(C)).toBe("in c");
  const space = (await app.spaces.acquire(B))!;
  expect(revisions(space.timeline.getState()).at(-1)?.source).toBe("assistant");
});

test("permission is the chat's: another chat asks again", async () => {
  app.chats.grant("chat", { edit: B });
  host.endTurn("t1");
  app.chats.saveChat("other", "Other", [{ role: "user", text: "hi" }], []);
  host.beginTurn({ id: "t2", chatId: "other", scope: A });
  expect(await edit(B)).toMatchObject(askEdit(B));
});

test("nothing a tool is handed can allow anything", async () => {
  const sneaky = {
    content: "changed",
    explanation: "Changed it.",
    space: B,
    allow: true,
    permissions: { edit: [B], webWithSpaces: true },
    edit: [B],
  };
  expect(await run("write_script", sneaky)).toMatchObject(askEdit(B));
  expect(app.chats.getPermissions("chat")).toEqual({
    read: [],
    web: false,
    edit: [],
  });
  expect(await text(B)).toBe("in b");
});

test("the web after reading another space asks, and runs once the user allowed it", async () => {
  expect(await run("read_space", { space: B })).toContain("in b");
  expect(await run("fetch_page", { url: "https://x/?leak" })).toMatchObject(
    ASK_WEB,
  );
  expect(await run("simulate_script", { script: "print 1" })).toMatchObject(
    ASK_WEB,
  );
  expect(fetched).toEqual([]);
  expect(simulated).toEqual([]);
  // A tool that reaches nothing goes on.
  expect(await run("get_docs")).toBe("docs");

  app.chats.grant("chat", { webWithSpaces: false });
  expect(await run("fetch_page", { url: "https://x" })).toMatchObject(ASK_WEB);
  app.chats.grant("chat", { webWithSpaces: true });
  expect(await run("fetch_page", { url: "https://x" })).toBe("a page");
});

test("reading another space after the web asks, and the list of spaces is such a reading", async () => {
  await run("fetch_page", { url: "https://x" });
  expect(await run("read_space", { space: B })).toMatchObject(ASK_WEB);
  expect(await run("get_script", { space: B })).toMatchObject(ASK_WEB);
  expect(await run("list_spaces")).toMatchObject(ASK_WEB);
  expect(await run("get_script")).toContain("in a");
});

test("what a chat took in is remembered across turns, and a space read as 'here' is another one from elsewhere", async () => {
  await run("get_script");
  host.endTurn("t1");
  host.beginTurn({ id: "t2", chatId: "chat", scope: B });
  expect(await run("fetch_page", { url: "https://x" })).toMatchObject(ASK_WEB);
});

test("calls made together see each other", async () => {
  const [read, page] = await Promise.all([
    run("read_space", { space: B }),
    run("fetch_page", { url: "https://x" }),
  ]);
  expect(read).toContain("in b");
  expect(page).toMatchObject(ASK_WEB);
  expect(fetched).toEqual([]);
});

test("an unknown or empty space id is an error: never the space on screen, never a new space", async () => {
  for (const space of ["nope", "", " ", null, 7]) {
    expect(await edit(space as string)).toEqual({
      error: expect.stringContaining("No space with id"),
    });
    expect(await run("get_script", { space })).toEqual({
      error: expect.stringContaining("No space with id"),
    });
  }
  expect(await text(A)).toBe("in a");
  expect(app.spaces.index.getState().length).toBe(3);
});

test("outside a turn, or in a chat that is not kept, nothing runs", async () => {
  host.endTurn("t1");
  expect(await run("fetch_page", { url: "https://x" })).toEqual({
    error: "No message is being answered.",
  });
  host.beginTurn({ id: "t2", chatId: "never-saved", scope: A });
  expect(await run("get_script")).toEqual({
    error: "No message is being answered.",
  });
  expect(fetched).toEqual([]);
});

test("a chat deleted during its turn stops the turn's tools", async () => {
  app.chats.removeChat("chat");
  expect(await edit()).toEqual({ error: "No message is being answered." });
  expect(await text(A)).toBe("in a");
});
