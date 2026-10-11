import { expect, test } from "bun:test";
import path from "node:path";
import type { Action } from "@evmcrispr/sdk";
import { act, fireEvent, screen } from "@testing-library/react";
import { Glob } from "bun";
import { HeldRun } from "../../src/panel/space/HeldRun";
import { testBrowser } from "../helpers/app";
import { fakeEvml, type Step } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

const SRC = path.resolve(import.meta.dir, "../../src");
const to = "0x000000000000000000000000000000000000dEaD" as const;
const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});

// Resume passes a held action to the wallet. It was prepared before the
// pause, so it is only ever offered next to what it will send.
test("only the component that shows the held action can resume a run", async () => {
  const callers: string[] = [];
  for await (const file of new Glob("**/*.{ts,tsx}").scan(SRC)) {
    const source = await Bun.file(path.join(SRC, file)).text();
    if (/\.resume\(/.test(source)) callers.push(file);
  }
  // The manager passes it on to the gate; one component calls it.
  expect(callers.sort()).toEqual([
    "panel/space/HeldRun.tsx",
    "runs/run-manager.ts",
  ]);
});

async function paused(steps: Step[]) {
  const evml = fakeEvml(steps, async () => {
    throw refusal;
  });
  const app = testBrowser().tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  const started = await app.runs.start(id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  await settle();
  const run = () => app.runs.store.getState()[started.runId];
  return { app, space, evml, run };
}

test("says why the run paused, what Resume will send and to whom, before the button", async () => {
  const action: Action = {
    to,
    data: "0xa9059cbb00",
    value: 10n ** 18n,
    chainId: 100,
  };
  const t = await paused([{ action }]);
  renderInSpace(<HeldRun run={t.run()} />, t);
  const held = screen.getByRole("group", { name: "Held action" });
  expect(held.textContent).toContain("Paused: you declined in your wallet");
  expect(held.textContent).toContain("Contract call");
  expect(held.textContent).toContain(to); // the whole address, not a short form
  // Value and function, both; the value in the chain's own currency.
  expect(held.textContent).toContain("1 XDAI");
  expect(held.textContent).toContain("0xa9059cbb");
  expect(held.textContent).toContain("Gnosis");
  // The calldata is there in full, behind its summary.
  expect(held.querySelector("details pre")?.textContent).toBe("0xa9059cbb00");
  expect(screen.getByRole("button", { name: `Copy ${to}` })).toBeTruthy();
  // For how long it has been held (the test's clock is not the wall's).
  expect(held.textContent).toMatch(/just now|min ago/);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await settle();
  });
  expect(t.evml.attempts).toBe(2);
});

test("a held change of chain says which chain", async () => {
  const t = await paused([{ chain: 100 }]);
  renderInSpace(<HeldRun run={t.run()} />, t);
  const held = screen.getByRole("group", { name: "Held action" });
  expect(held.textContent).toContain("Switch network");
  expect(held.textContent).toContain("Gnosis");
});

test("a run that holds nothing offers no Resume", async () => {
  const t = await paused([{ chain: 100 }]);
  renderInSpace(<HeldRun run={{ ...t.run(), held: null }} />, t);
  expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
});
