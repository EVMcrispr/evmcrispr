import { beforeEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "../../src/app/AppContext";
import { SpaceProvider } from "../../src/app/SpaceContext";
import {
  ARM_MS,
  askForReview,
  closeReview,
  showReview,
  surfaceNow,
} from "../../src/review/surface";
import { useApproval } from "../../src/review/useReview";
import type { LiveSpace } from "../../src/space/live-space";
import { testBrowser } from "../helpers/app";

const turn = (space: LiveSpace, id: string, text: string) => {
  space.editAsTurn(id, { kind: "write", text });
  space.endTurn(id);
};

const armed = () => new Promise((resolve) => setTimeout(resolve, ARM_MS + 20));

beforeEach(closeReview);

async function setup(asked: boolean) {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "one", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  turn(space, "t1", "two");
  // Opened by the user asking, or by itself.
  if (asked) askForReview(space);
  else showReview();
  const hook = renderHook(() => useApproval(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppProvider app={app}>
        <SpaceProvider value={space}>{children}</SpaceProvider>
      </AppProvider>
    ),
  });
  return {
    app,
    space,
    hook,
    approved: () => space.markers.getState().approvedText,
  };
}

test("a review that came up by itself shows nothing and approves nothing until the user asks", async () => {
  const t = await setup(false);
  expect(t.hook.result.current).toMatchObject({
    shown: null,
    stale: false,
    armed: false,
  });
  expect(t.hook.result.current.approve()).toBe(false);
  expect(t.approved()).toBe("one");
  act(() => t.hook.result.current.ask());
  expect(t.hook.result.current.shown?.text).toBe("two");
  await act(armed);
  expect(t.hook.result.current.approve()).toBe(true);
  expect(t.approved()).toBe("two");
});

test("what was just put on screen cannot be approved yet, by the button or by a call", async () => {
  const t = await setup(true);
  expect(t.hook.result.current.armed).toBe(false);
  expect(t.hook.result.current.approve()).toBe(false);
  expect(t.approved()).toBe("one");
  await act(armed);
  expect(t.hook.result.current.armed).toBe(true);
  // Asking again starts the wait again.
  act(() => t.hook.result.current.ask());
  expect(t.hook.result.current.armed).toBe(false);
  expect(t.hook.result.current.approve()).toBe(false);
  await act(armed);
  expect(t.hook.result.current.approve()).toBe(true);
});

test("a review is a snapshot: a change meanwhile leaves it as it was, stale, and unapprovable until the user asks again", async () => {
  const t = await setup(true);
  await act(armed);
  const first = t.hook.result.current;
  expect(first.shown).toMatchObject({
    text: "two",
    diff: [
      { kind: "removed", text: "one" },
      { kind: "added", text: "two" },
    ],
  });
  act(() => turn(t.space, "t2", "three"));
  // What is shown did not move; it is marked stale.
  expect(t.hook.result.current.shown).toBe(first.shown);
  expect(t.hook.result.current).toMatchObject({ stale: true, armed: false });
  expect(t.hook.result.current.approve()).toBe(false);
  // An Approve fired with the earlier render's snapshot, which does not
  // know it is stale, is refused by the space itself: it compares with
  // the document, and "two" is no longer the script.
  expect(first.stale).toBe(false);
  expect(first.approve()).toBe(false);
  expect(t.approved()).toBe("one");

  act(() => t.hook.result.current.ask());
  await act(armed);
  expect(t.hook.result.current).toMatchObject({
    stale: false,
    shown: { text: "three" },
  });
  expect(t.hook.result.current.approve()).toBe(true);
  expect(t.approved()).toBe("three");
});

test("closing the review forgets what was shown; another space's snapshot is not this one's", async () => {
  const t = await setup(true);
  await act(armed);
  act(closeReview);
  expect(t.hook.result.current.shown).toBeNull();
  expect(t.hook.result.current.approve()).toBe(false);
  act(showReview);
  expect(t.hook.result.current.shown).toBeNull();

  const other = await t.app.spaces.create({ text: "two", source: "user" });
  const there = (await t.app.spaces.acquire(other))!;
  turn(there, "t", "elsewhere");
  act(() => askForReview(there));
  expect(surfaceNow().shown?.text).toBe("elsewhere");
  expect(t.hook.result.current.shown).toBeNull();
  await act(armed);
  expect(t.hook.result.current.approve()).toBe(false);
  expect(t.approved()).toBe("one");
});

test("an error while approving approves nothing", async () => {
  const t = await setup(true);
  await act(armed);
  (t.space as { approve: unknown }).approve = () => {
    throw new Error("storage is gone");
  };
  expect(t.hook.result.current.approve()).toBe(false);
  expect(t.approved()).toBe("one");
});
