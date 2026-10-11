import { expect, test } from "bun:test";
import {
  CANCELLED,
  createGate,
  type Held,
  type HoldStatus,
} from "../../src/runs/gate";

const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});
const heldBack = new Error("not passed");
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(onScreen = true) {
  const screen = { on: onScreen };
  const changes: (Held<string> | null)[] = [];
  const statuses: HoldStatus[] = [];
  const gate = createGate<string>({
    onScreen: () => screen.on,
    isRefusal: (e) => (e as { code?: number }).code === 4001,
    isHeldBack: (e) => e === heldBack,
    now: () => 42,
    onChange: (h) => changes.push(h),
  });
  return {
    screen,
    changes,
    statuses,
    gate,
    status: (s: HoldStatus) => statuses.push(s),
  };
}

test("on screen: passes straight to the wallet", async () => {
  const t = setup();
  expect(await t.gate.pass("tx", async () => "0xhash", t.status)).toBe(
    "0xhash",
  );
  expect(t.statuses).toEqual(["waiting"]);
  expect(t.changes).toEqual([]);
});

test("off screen: holds, sends nothing, and only Resume releases", async () => {
  const t = setup(false);
  let sent = 0;
  const result = t.gate.pass("tx", async () => ++sent, t.status);
  await tick();
  expect(sent).toBe(0);
  expect(t.gate.held()).toEqual({ action: "tx", reason: "left", since: 42 });
  t.screen.on = true;
  await tick();
  expect(sent).toBe(0); // never resumes by itself
  t.gate.resume();
  expect(await result).toBe(1);
  expect(t.statuses).toEqual(["paused", "waiting"]);
  expect(t.gate.held()).toBeNull();
  expect(t.changes.at(-1)).toBeNull();
});

test("resumed while still off screen: held again, nothing sent", async () => {
  const t = setup(false);
  let sent = 0;
  void t.gate.pass("tx", async () => ++sent, t.status).catch(() => {});
  await tick();
  t.gate.resume();
  await tick();
  expect(sent).toBe(0);
  expect(t.gate.held()?.reason).toBe("left");
});

test("a refusal pauses; Resume asks again", async () => {
  const t = setup();
  let asked = 0;
  const send = async () => {
    if (++asked < 3) throw refusal;
    return "ok";
  };
  const result = t.gate.pass("tx", send, t.status);
  await tick();
  expect(t.gate.held()?.reason).toBe("declined");
  t.gate.resume();
  await tick();
  expect(asked).toBe(2);
  t.gate.resume();
  expect(await result).toBe("ok");
  expect(t.statuses).toEqual([
    "waiting",
    "declined",
    "waiting",
    "declined",
    "waiting",
  ]);
});

test("Cancel after a refusal hands the refusal to the script", async () => {
  const t = setup();
  const result = t.gate.pass(
    "tx",
    async () => {
      throw refusal;
    },
    t.status,
  );
  await tick();
  t.gate.cancel();
  await expect(result).rejects.toBe(refusal);
});

test("cancelling an action held for leaving rejects as cancelled", async () => {
  const t = setup(false);
  const result = t.gate.pass("tx", async () => 1, t.status);
  await tick();
  t.gate.cancel();
  await expect(result).rejects.toThrow(CANCELLED);
});

test("after Cancel nothing reaches the wallet, and a refusal no longer holds", async () => {
  const t = setup();
  let fail!: (error: unknown) => void;
  const open = t.gate.pass(
    "tx",
    () => new Promise((_, reject) => (fail = reject)),
    t.status,
  );
  await tick();
  t.gate.cancel();
  fail(refusal);
  await expect(open).rejects.toBe(refusal);
  expect(t.gate.held()).toBeNull();

  let sent = 0;
  await expect(
    t.gate.pass("next", async () => ++sent, t.status),
  ).rejects.toThrow(CANCELLED);
  expect(sent).toBe(0);
});

test("an error after the action was sent is never a refusal to ask again", async () => {
  const t = setup();
  let asked = 0;
  const result = t.gate.pass(
    "tx",
    async (sent) => {
      asked++;
      sent();
      throw refusal; // e.g. a later step of the same handler failing
    },
    t.status,
  );
  await expect(result).rejects.toBe(refusal);
  expect(t.gate.held()).toBeNull();
  t.gate.resume();
  await tick();
  expect(asked).toBe(1);
  expect(t.statuses).toEqual(["waiting"]);
});

test("actions pass one at a time, each held on its own", async () => {
  const t = setup();
  const order: string[] = [];
  let finishFirst!: () => void;
  const first = t.gate.pass(
    "a",
    () =>
      new Promise<void>((resolve) => {
        order.push("a");
        finishFirst = resolve;
      }),
    t.status,
  );
  const second = t.gate.pass("b", async () => void order.push("b"), t.status);
  await tick();
  expect(order).toEqual(["a"]);
  t.screen.on = false;
  finishFirst();
  await first;
  await tick();
  expect(t.gate.held()).toEqual({ action: "b", reason: "left", since: 42 });
  t.screen.on = true;
  t.gate.resume();
  await second;
  expect(order).toEqual(["a", "b"]);
});

test("allows a request only during a pass, on screen, while open", async () => {
  const t = setup();
  expect(t.gate.allows()).toBe(false);
  let during: boolean[] = [];
  let finish!: () => void;
  const result = t.gate.pass(
    "tx",
    () =>
      new Promise<void>((resolve) => {
        during = [t.gate.allows()];
        finish = resolve;
      }),
    t.status,
  );
  await tick();
  t.screen.on = false;
  during.push(t.gate.allows());
  t.screen.on = true;
  t.gate.cancel();
  during.push(t.gate.allows());
  finish();
  await result;
  expect(during).toEqual([true, false, false]);
  expect(t.gate.allows()).toBe(false);
});

test("a request held back because the user left is held, not failed", async () => {
  const t = setup();
  let calls = 0;
  const result = t.gate.pass(
    "tx",
    async () => {
      if (++calls === 1) {
        t.screen.on = false; // left between the check and the request
        throw heldBack;
      }
      return "ok";
    },
    t.status,
  );
  await tick();
  expect(t.gate.held()?.reason).toBe("left");
  t.screen.on = true;
  t.gate.resume();
  expect(await result).toBe("ok");
  expect(t.statuses).toEqual(["waiting", "paused", "waiting"]);
});

test("any other wallet error ends the action", async () => {
  const t = setup();
  await expect(
    t.gate.pass(
      "tx",
      async () => {
        throw new Error("insufficient funds");
      },
      t.status,
    ),
  ).rejects.toThrow("insufficient funds");
  expect(t.gate.held()).toBeNull();
});
