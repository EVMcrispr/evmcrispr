import { expect, test } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { act, screen } from "@testing-library/react";
import {
  useActiveRun,
  useExecutingLine,
  useRunOf,
} from "../../src/runs/useRun";
import { testBrowser } from "../helpers/app";
import { fakeEvml } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

const to = "0x000000000000000000000000000000000000dEaD" as const;
const tx: Action = { to, data: "0x01" };

function Probe({ runId }: { runId?: string }) {
  const active = useActiveRun();
  const line = useExecutingLine();
  const one = useRunOf(runId ?? "none");
  return (
    <output>
      {active?.record.status ?? "none"}|{line ?? "-"}|
      {one?.record.status ?? "-"}|{one?.live ? "live" : "stored"}
    </output>
  );
}

test("views read the run of the space on screen, and any run by id", async () => {
  const browser = testBrowser();
  const evml = fakeEvml(
    [{ line: 3 }, { action: tx }],
    () => new Promise(() => {}),
  );
  const app = browser.tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  const view = renderInSpace(<Probe />, { app, space });
  const shown = () => screen.getByRole("status").textContent;
  expect(shown()).toBe("none|-|-|stored");

  const started = await app.runs.start(id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  await act(settle);
  expect(shown()).toBe("running|3|-|stored");

  await act(async () => {
    app.runs.cancel(started.runId);
    await started.ended;
  });
  expect(shown()).toBe("none|-|-|stored");
  view.unmount();

  // By id: live in the tab that ran it, its stored record in another.
  renderInSpace(<Probe runId={started.runId} />, { app, space });
  expect(shown()).toBe("none|-|cancelled|live");
  const other = browser.tab();
  const theirs = (await other.spaces.acquire(id))!;
  view.unmount();
  document.body.innerHTML = "";
  renderInSpace(<Probe runId={started.runId} />, { app: other, space: theirs });
  expect(shown()).toBe("none|-|cancelled|stored");
});
