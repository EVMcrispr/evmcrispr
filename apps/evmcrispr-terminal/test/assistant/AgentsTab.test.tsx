import { afterEach, beforeEach, expect, test } from "bun:test";
import { head, isReviewed, revisions } from "@evmcrispr/space";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useLocation } from "react-router";
import type { App } from "../../src/app/boot";
import { setUi, uiStore } from "../../src/app/ui-store";
import {
  type Assistant,
  AssistantProvider,
  useAssistant,
} from "../../src/assistant/AssistantProvider";
import { AgentsTab } from "../../src/panel/agents/AgentsTab";
import type { LiveSpace } from "../../src/space/live-space";
import { lockNames } from "../../src/storage/locks";
import { testBrowser } from "../helpers/app";
import { fakeEvml } from "../helpers/fake-evml";
import { fakeNexus } from "../helpers/nexus";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

let nexus: ReturnType<typeof fakeNexus>;
let browser: ReturnType<typeof testBrowser>;
let assistant: Assistant;

const Probe = () => {
  assistant = useAssistant();
  return <output data-testid="address">{useLocation().pathname}</output>;
};

const tab = () =>
  browser.tab({
    evml: () =>
      fakeEvml([{ log: "1.5 ETH" }], async () => undefined, {
        simulation: { logs: ["1.5 ETH"] },
      }),
  });

async function show(app: App, space: LiveSpace | null) {
  await app.chats.ready;
  if (space) app.spaces.show(space.id);
  return renderInSpace(
    <QueryClientProvider client={new QueryClient()}>
      <AssistantProvider>
        <AgentsTab />
        <Probe />
      </AssistantProvider>
    </QueryClientProvider>,
    { app, space },
  );
}

async function make(app: App, text: string) {
  const id = await app.spaces.create({ text, source: "user" });
  return (await app.spaces.acquire(id))!;
}

const composer = () =>
  screen.getByRole("textbox") as unknown as HTMLTextAreaElement;

async function say(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(assistant.isRunning).toBe(true));
  await waitFor(() => expect(assistant.isRunning).toBe(false), {
    timeout: 4000,
  });
  await act(settle);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("evmcrispr:nexusApiKey", "nexus-key");
  nexus = fakeNexus();
  browser = testBrowser();
  setUi({ activeTab: "agents", chatRequest: null });
});
afterEach(() => {
  cleanup();
  nexus.restore();
});

test("an edit is one revision with the assistant's explanation, shown on its card; undo takes the turn back in one step", async () => {
  const app = tab();
  const space = await make(app, "# Pay\nexec 1\nexec 2");
  await show(app, space);
  nexus.answers.push(
    {
      tool: "edit_script",
      input: {
        old_string: "exec 1",
        new_string: "exec 10",
        explanation: "Raised the first amount.",
      },
    },
    {
      tool: "edit_script",
      input: {
        old_string: "exec 2",
        new_string: "exec 20",
        explanation: "Raised the second amount.",
      },
    },
    { text: "Both raised." },
  );
  await say("raise them");

  expect(space.getText()).toBe("# Pay\nexec 10\nexec 20");
  const all = revisions(space.timeline.getState());
  expect(all.map((r) => r.source)).toEqual(["user", "assistant"]);
  expect(all[1].summary).toBe(
    "Raised the first amount. Raised the second amount.",
  );
  expect(screen.getByText("Raised the first amount.")).toBeTruthy();
  expect(screen.getByText("Both raised.")).toBeTruthy();
  // Not the user's writing: the space is unreviewed.
  expect(
    isReviewed(space.getText(), space.markers.getState().approvedText),
  ).toBe(false);
  // The model was told where the content it read came from.
  expect(JSON.stringify(nexus.requests[0].messages)).not.toContain("exec 1");

  fireEvent.click(
    screen.getAllByRole("button", { name: "See in timeline" })[0],
  );
  expect(uiStore.getState()).toMatchObject({
    activeTab: "space",
    spaceView: "timeline",
  });

  expect(space.undo.undo()).toBe(true);
  expect(space.getText()).toBe("# Pay\nexec 1\nexec 2");
  expect(
    isReviewed(space.getText(), space.markers.getState().approvedText),
  ).toBe(true);
});

test("the chat survives a reload and reopens; it stays open when the space changes; it is labelled with where it started", async () => {
  const app = tab();
  const a = await make(app, "# Space A\nexec 1");
  const b = await make(app, "# Space B\nexec 2");
  const first = await show(app, a);
  nexus.answers.push({ text: "Hello there." });
  await say("hi from a");
  const chatId = assistant.conversationId;
  await app.chats.flushed();
  first.unmount();

  // A reload: another App object on the same storage, another space.
  const reloaded = tab();
  const view = await show(reloaded, (await reloaded.spaces.acquire(b.id))!);
  expect(assistant.conversationId).toBe(chatId);
  expect(screen.getByText("hi from a")).toBeTruthy();
  expect(screen.getByText("Hello there.")).toBeTruthy();

  // Moving to another space changes nothing of the chat.
  await act(async () => reloaded.spaces.show(a.id));
  expect(assistant.conversationId).toBe(chatId);
  expect(screen.getByText("Hello there.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
  expect(
    await screen.findByText(/started in Space A/, {}, { timeout: 2000 }),
  ).toBeTruthy();
  view.unmount();
});

test("a new chat only when the user asks; the next message from another space works there", async () => {
  const app = tab();
  const a = await make(app, "in a");
  const b = await make(app, "in b");
  const view = await show(app, a);
  nexus.answers.push({ text: "One." });
  await say("first");
  const chatId = assistant.conversationId;

  // The user moves to B and says "the same here": same chat, B's script.
  await act(async () => app.spaces.show(b.id));
  nexus.answers.push(
    {
      tool: "write_script",
      input: { content: "changed", explanation: "Same here." },
    },
    { text: "Two." },
  );
  await say("the same here");
  expect(assistant.conversationId).toBe(chatId);
  expect(b.getText()).toBe("changed");
  expect(a.getText()).toBe("in a");

  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(assistant.conversationId).not.toBe(chatId);
  expect(screen.queryByText("One.")).toBeNull();
  view.unmount();
});

test("an edit to a space that is not on screen waits for the user's word, then lands there and marks it unreviewed", async () => {
  const app = tab();
  const a = await make(app, "# Here\nexec 1");
  const b = await make(app, "# Treasury swap\nexec 2");
  app.spaces.release(b.id);
  await show(app, a);
  const edit = {
    tool: "write_script",
    input: {
      content: "# Treasury swap\nexec 666",
      explanation: "Changed the other one.",
      space: b.id,
    },
  };
  nexus.answers.push(edit, { text: "I need your permission." });
  await say("change the other one");

  const prompt = screen.getByText(
    "Let the assistant edit “Treasury swap”? You are not looking at it.",
  );
  expect(prompt).toBeTruthy();
  const unchanged = (await app.spaces.acquire(b.id))!;
  expect(unchanged.getText()).toBe("# Treasury swap\nexec 2");
  app.spaces.release(b.id);

  fireEvent.click(screen.getByRole("button", { name: "Allow for this chat" }));
  expect(screen.getByText(/Allowed for this chat/)).toBeTruthy();
  nexus.answers.push(edit, { text: "Done." });
  await say("go on");
  await act(settle);

  const changed = (await app.spaces.acquire(b.id))!;
  expect(changed.getText()).toBe("# Treasury swap\nexec 666");
  expect(head(changed.timeline.getState())).toMatchObject({
    source: "assistant",
    summary: "Changed the other one.",
  });
  const mark = (id: string) =>
    app.spaces.index.getState().find((m) => m.id === id)?.unreviewed;
  await waitFor(() => expect(mark(b.id)).toBe(true));
  expect(mark(a.id)).toBe(false);
  expect(a.getText()).toBe("# Here\nexec 1");
});

test("a simulation card shows the code that ran and its logs; a snippet opened as a space is unreviewed", async () => {
  const app = tab();
  const a = await make(app, "exec 1");
  await show(app, a);
  nexus.answers.push(
    { tool: "simulate_script", input: { script: "print @me" } },
    { text: "That is you." },
  );
  await say("who am i");

  const card = screen.getByText("Simulation passed").closest("article")!;
  expect(within(card).getByText(/Ran a snippet/)).toBeTruthy();
  expect(within(card).queryByText("print @me")).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Code and logs" }));
  expect(within(card).getByText("print @me")).toBeTruthy();
  expect(within(card).getByText("1.5 ETH")).toBeTruthy();
  // Nothing of it is in the space's timeline.
  expect(a.timeline.getState().entries.size).toBe(1);

  fireEvent.click(
    within(card).getByRole("button", { name: "Open in new space" }),
  );
  await waitFor(() => expect(app.spaces.index.getState().length).toBe(2));
  const made = app.spaces.index.getState().find((m) => m.id !== a.id)!;
  await waitFor(() =>
    expect(screen.getByTestId("address").textContent).toBe(`/${made.id}`),
  );
  const space = (await app.spaces.acquire(made.id))!;
  expect(space.getText()).toBe("print @me");
  expect(space.markers.getState().approvedText).toBeUndefined();

  // Loading it here is a load like any other: recorded, and not approved.
  fireEvent.click(within(card).getByRole("button", { name: "Load in editor" }));
  expect(a.getText()).toBe("print @me");
  expect(head(a.timeline.getState())?.source).toBe("load");
  expect(isReviewed(a.getText(), a.markers.getState().approvedText)).toBe(
    false,
  );
});

test("the same chat in two tabs answers one turn at a time, and is not deleted under a turn", async () => {
  const [one, two] = [tab(), tab()];
  const a = await make(one, "exec 1");
  one.chats.saveChat(
    "shared",
    "Shared",
    [{ role: "user", text: "earlier" }],
    [],
  );
  one.chats.setLastChatId("shared");
  await one.chats.flushed();
  await show(two, (await two.spaces.acquire(a.id))!);
  expect(assistant.conversationId).toBe("shared");

  // The first tab is answering.
  const release = (await one.locks.tryHold(lockNames.chat("shared")))!;
  one.chats.saveChat(
    "shared",
    "Shared",
    [
      { role: "user", text: "earlier" },
      { role: "user", text: "from tab one" },
    ],
    [],
  );
  await one.chats.flushed();
  await waitFor(() =>
    expect(
      screen.getByText("Answering in another tab…", { selector: "p" }),
    ).toBeTruthy(),
  );
  expect(composer().disabled).toBe(true);
  expect(screen.getByText("from tab one")).toBeTruthy();

  // Asked anyway (as a second click in flight would): nothing is sent.
  await act(async () => {
    assistant.send("me too");
    await settle();
  });
  expect(nexus.requests.length).toBe(0);
  expect(screen.queryByText("me too")).toBeNull();

  // Nor can the chat be deleted from under the turn.
  await act(async () => {
    assistant.deleteChat("shared");
    await settle();
  });
  expect(two.chats.getChat("shared")).not.toBeNull();
  expect(one.chats.getChat("shared")).not.toBeNull();

  // The first tab's turn ends: its answer shows here, and this tab can go on.
  one.chats.saveChat(
    "shared",
    "Shared",
    [
      { role: "user", text: "earlier" },
      { role: "user", text: "from tab one" },
      { role: "assistant", text: "answered in tab one" },
    ],
    [],
  );
  await one.chats.flushed();
  release();
  await waitFor(() => expect(composer().disabled).toBe(false), {
    timeout: 3000,
  });
  expect(screen.getByText("answered in tab one")).toBeTruthy();
  nexus.answers.push({ text: "Now here." });
  await say("and here");
  expect(screen.getByText("Now here.")).toBeTruthy();
  await two.chats.flushed();
  await act(settle);
  expect(one.chats.getChat("shared")?.items.length).toBe(5);

  // With nobody answering, it can be deleted, everywhere.
  await act(async () => {
    assistant.deleteChat("shared");
    await settle();
    await two.chats.flushed();
    await settle();
  });
  expect(two.chats.getChat("shared")).toBeNull();
  expect(one.chats.getChat("shared")).toBeNull();
});

test("a chat is not deleted while this tab is answering in it", async () => {
  const app = tab();
  await show(app, await make(app, "exec 1"));
  let open!: () => void;
  nexus.gate = new Promise((resolve) => {
    open = resolve;
  });
  fireEvent.change(composer(), { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(nexus.requests.length).toBe(1));
  const chatId = assistant.conversationId;
  await act(async () => {
    assistant.deleteChat(chatId);
    await settle();
  });
  expect(app.chats.getChat(chatId)).not.toBeNull();
  open();
  await waitFor(() => expect(assistant.isRunning).toBe(false));
  expect(app.chats.getChat(chatId)?.items.at(-1)).toEqual({
    role: "assistant",
    text: "Done.",
  });
});

test("without a key the Agents tab shows the sign-in screen", async () => {
  localStorage.clear();
  const app = tab();
  await show(app, await make(app, "exec 1"));
  expect(
    screen.getByRole("button", { name: /Login with Dappnode Nexus/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "" })).toBeNull();
});
