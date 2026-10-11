import { beforeEach, expect, test } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { act, fireEvent, screen } from "@testing-library/react";
import { setUi, uiStore } from "../../src/app/ui-store";
import { ExecuteButton } from "../../src/components/execution/ExecuteButton";
import { testBrowser } from "../helpers/app";
import { fakeEvml } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

const to = "0x000000000000000000000000000000000000dEaD" as const;
const tx: Action = { to, data: "0x01" };
const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});
const names = () =>
  screen.getAllByRole("button").map((button) => button.textContent);

async function setup(wallet: Parameters<typeof fakeEvml>[1]) {
  const browser = testBrowser();
  const evml = fakeEvml([{ action: tx }], wallet);
  const app = browser.tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  return { browser, app, evml, id, space };
}

beforeEach(() => setUi({ activeTab: "reference", spaceView: "list" }));

test("Execute starts a run and shows its timeline; Cancel ends it", async () => {
  const t = await setup(() => new Promise(() => {}));
  renderInSpace(<ExecuteButton />, t);
  expect(names()).toEqual(["Execute"]);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await settle();
  });
  expect(uiStore.getState()).toMatchObject({
    activeTab: "space",
    spaceView: "timeline",
  });
  expect(names()).toEqual(["Cancel"]);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
  });
  expect(names()).toEqual(["Execute"]);
});

test("a paused run offers the way to its card, where Resume is, and Cancel", async () => {
  const t = await setup(async () => {
    throw refusal;
  });
  renderInSpace(<ExecuteButton />, t);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await settle();
  });
  expect(names()).toEqual(["Show paused run", "Cancel"]);
  setUi({ activeTab: "reference", spaceView: "list" });
  fireEvent.click(screen.getByRole("button", { name: "Show paused run" }));
  expect(uiStore.getState()).toMatchObject({
    activeTab: "space",
    spaceView: "timeline",
  });
  expect(t.evml.attempts).toBe(1);
});

test("while the space runs in another tab, Execute is disabled and says why", async () => {
  const t = await setup(() => new Promise(() => {}));
  await t.app.runs.start(t.id, { mode: "real" });
  await settle();
  const other = t.browser.tab();
  const space = (await other.spaces.acquire(t.id))!;
  other.spaces.show(t.id);
  renderInSpace(<ExecuteButton />, { app: other, space });
  const execute = screen.getByRole("button", {
    name: "Execute",
  }) as HTMLButtonElement;
  expect(execute.disabled).toBe(true);
  expect(execute.parentElement?.title).toBe("Running in another tab");
});
