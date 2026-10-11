import { afterEach, expect, test } from "bun:test";
import { head } from "@evmcrispr/space";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { setUi, uiStore } from "../../src/app/ui-store";
import { PermissionPrompt } from "../../src/panel/agents/PermissionPrompt";
import { ToolCard } from "../../src/panel/agents/ToolCards";
import { RevisionRow } from "../../src/panel/space/RevisionRow";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";
import { renderInSpace, renderWithApp } from "../setup/test-utils";

afterEach(cleanup);

async function setup() {
  const app = testBrowser().tab();
  await app.chats.ready;
  app.chats.saveChat("chat", "Chat", [{ role: "user", text: "hi" }], []);
  return app;
}

test("using the web after reading other spaces: asked in plain words, answered by a click, remembered for the chat", async () => {
  const app = await setup();
  renderWithApp(<PermissionPrompt chatId="chat" ask={{ what: "web" }} />, {
    app,
  });
  expect(
    screen.getByText(
      "Let the assistant use the web in this chat after reading your other spaces? Content from them could be sent out.",
    ),
  ).toBeTruthy();
  expect(app.chats.getPermissions("chat")?.webWithSpaces).toBeUndefined();

  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(app.chats.getPermissions("chat")?.webWithSpaces).toBe(false);
  expect(screen.getByText("Not allowed.")).toBeTruthy();

  // The user may change their mind; only they can.
  fireEvent.click(screen.getByRole("button", { name: "Allow for this chat" }));
  expect(app.chats.getPermissions("chat")?.webWithSpaces).toBe(true);
  expect(screen.queryByRole("button")).toBeNull();
  expect(app.chats.getPermissions("other")).toBeUndefined();
});

test("editing a space: it is named from the user's own list, and one that is gone cannot be allowed", async () => {
  const app = await setup();
  const id = await app.spaces.create({
    text: "# Treasury swap, October",
    source: "user",
  });
  const view = renderWithApp(
    <PermissionPrompt chatId="chat" ask={{ what: "edit", space: id }} />,
    { app },
  );
  expect(
    screen.getByText(
      "Let the assistant edit “Treasury swap, October”? You are not looking at it.",
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(app.chats.getPermissions("chat")?.edit).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Allow for this chat" }));
  expect(app.chats.getPermissions("chat")?.edit).toEqual([id]);
  view.unmount();

  renderWithApp(
    <PermissionPrompt chatId="chat" ask={{ what: "edit", space: "nope" }} />,
    { app },
  );
  expect(screen.queryByRole("button")).toBeNull();
});

test("what the model wrote is shown as text, never as markup or a link", async () => {
  const app = await setup();
  renderWithApp(
    <ToolCard
      chatId="chat"
      actions={{}}
      item={{
        role: "tool",
        text: "edit_script",
        phase: "result",
        artifact: {
          kind: "script-change",
          ok: true,
          explanation:
            "[Click here](https://evil.example) <img src=x onerror=alert(1)> **now**",
        },
      }}
    />,
    { app },
  );
  expect(
    screen.getByText(
      "[Click here](https://evil.example) <img src=x onerror=alert(1)> **now**",
    ),
  ).toBeTruthy();
  expect(document.querySelector("a")).toBeNull();
  expect(document.querySelector("img")).toBeNull();
});

test("a simulation of the script offers the review; a snippet's does not; an old card still shows", async () => {
  const app = await setup();
  let reviews = 0;
  const card = (target?: "script" | "snippet") =>
    renderWithApp(
      <ToolCard
        chatId="chat"
        actions={{ onReview: () => reviews++ }}
        item={{
          role: "tool",
          text: "simulate_script",
          phase: "result",
          artifact: {
            kind: "simulation",
            success: true,
            actionCount: 2,
            ...(target ? { target, code: "exec 1", logs: [] } : {}),
          },
        }}
      />,
      { app },
    );
  let view = card("script");
  fireEvent.click(screen.getByRole("button", { name: "Review transactions" }));
  expect(reviews).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Code and logs" }));
  expect(screen.getByText("No output")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Open in new space" }),
  ).toBeNull();
  view.unmount();
  view = card("snippet");
  expect(
    screen.queryByRole("button", { name: "Review transactions" }),
  ).toBeNull();
  view.unmount();
  card();
  expect(screen.getByText("2 actions resolved on a fork")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Code and logs" })).toBeNull();
});

test("a revision's row offers Open chat to its owner while the chat is kept", async () => {
  const app = await setup();
  const id = await app.spaces.create({ text: "exec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  space.editAsTurn("t1", { kind: "write", text: "exec 2" });
  const entry = space.endTurn("t1", "Doubled it.")!;
  const parent = head({
    ...space.timeline.getState(),
    entries: new Map([...space.timeline.getState().entries].slice(0, 1)),
  });
  const row = {
    kind: "revision" as const,
    entry,
    parent,
    added: 1,
    removed: 1,
    shared: false,
    unreviewed: true,
  };
  const view = renderInSpace(<RevisionRow row={row} />, { app, space });
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  expect(screen.queryByRole("button", { name: "Open chat" })).toBeNull();

  await act(async () => {
    await space.setMarkers({ revisionChats: { [entry.id]: "chat" } });
  });
  setUi({ activeTab: "space", chatRequest: null });
  fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
  expect(uiStore.getState()).toMatchObject({
    activeTab: "agents",
    chatRequest: { chatId: "chat" },
  });

  await act(async () => {
    app.chats.removeChat("chat");
    await space.setMarkers({ revisionChats: { [entry.id]: "chat" } });
    await settle();
  });
  view.unmount();
  renderInSpace(<RevisionRow row={row} />, { app, space });
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open chat" })).toBeNull();
});
