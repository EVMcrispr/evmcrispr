import { expect, test } from "bun:test";
import type { WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { guardWallet, NotPassed } from "../../src/runs/wallet-guard";

const account = "0x000000000000000000000000000000000000dEaD" as const;
const refusal = () =>
  Object.assign(new Error("User rejected the request."), { code: 4001 });

/** A wallet that answers each method from `answers`, and records what
 *  reached it. */
function setup(
  answers: Record<string, (params: unknown) => unknown> = {},
  onRequest: (method: string) => void = () => {},
) {
  let submitted = 0;
  const gate = { open: true };
  const reached: string[] = [];
  const wallet = {
    account: { address: account, type: "json-rpc" },
    chain: undefined,
    request: async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }) => {
      reached.push(method);
      onRequest(method);
      if (!(method in answers)) throw new Error(`no answer for ${method}`);
      return answers[method](params);
    },
  } as unknown as WalletClient;
  const guard = guardWallet(wallet, {
    submitted: () => submitted++,
    allows: () => gate.open,
  });
  const ask = (method: string) =>
    (guard.client.request as (args: { method: string }) => Promise<unknown>)({
      method,
    });
  return { guard, ask, gate, reached, submitted: () => submitted };
}

test("a refusal is the wallet's own answer to a request, wrapped or not", async () => {
  const t = setup({
    eth_sendTransaction: () => {
      throw refusal();
    },
  });
  const thrown = await t.ask("eth_sendTransaction").catch((e) => e);
  expect(t.guard.isRefusal(thrown)).toBe(true);
  expect(t.guard.isRefusal(new Error("execute(1:0)", { cause: thrown }))).toBe(
    true,
  );
  expect(t.submitted()).toBe(0);
});

test("an error that only looks like a refusal is not one", async () => {
  const t = setup({
    eth_getTransactionReceipt: () => {
      throw refusal(); // a node answering 4001 to a read
    },
  });
  expect(t.guard.isRefusal(refusal())).toBe(false);
  expect(
    t.guard.isRefusal(new Error("status poll failed", { cause: refusal() })),
  ).toBe(false);
  const fromRead = await t.ask("eth_getTransactionReceipt").catch((e) => e);
  expect(t.guard.isRefusal(fromRead)).toBe(false);
});

test("a request the wallet granted counts as sent, unless it submits nothing", async () => {
  const quiet = [
    "eth_chainId",
    "eth_accounts",
    "wallet_getCallsStatus",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
  ];
  const sends = [
    "eth_sendTransaction",
    "wallet_sendCalls",
    "eth_signTransaction",
    "personal_sign",
    "eth_signTypedData_v4",
    "wallet_somethingNew",
  ];
  const t = setup(
    Object.fromEntries([...quiet, ...sends].map((method) => [method, () => 1])),
  );
  for (const method of quiet) await t.ask(method);
  expect(t.submitted()).toBe(0);
  for (const method of sends) await t.ask(method);
  expect(t.submitted()).toBe(sends.length);
});

test("a request the gate has not let through never reaches the wallet", async () => {
  const t = setup({ eth_chainId: () => "0x1", eth_accounts: () => [] });
  t.gate.open = false;
  for (const method of [
    "eth_sendTransaction",
    "wallet_switchEthereumChain",
    "personal_sign",
    "wallet_somethingNew",
  ]) {
    const thrown = await t.ask(method).catch((e) => e);
    expect(thrown).toBeInstanceOf(NotPassed);
    expect(t.guard.isHeldBack(new Error("wrapped", { cause: thrown }))).toBe(
      true,
    );
  }
  expect(t.reached).toEqual([]);
  // Reading which chain and account the wallet is on asks nothing of it.
  expect(await t.ask("eth_chainId")).toBe("0x1");
  expect(await t.ask("eth_accounts")).toEqual([]);
});

test("the gate is asked when the request is made, not when the client's method is called", async () => {
  // viem asks the wallet its chain before it sends. The user leaves
  // during that round trip: the transaction must not follow.
  const t = setup(
    {
      eth_chainId: () => "0x1",
      eth_sendTransaction: () => `0x${"1".repeat(64)}`,
    },
    (method) => {
      if (method === "eth_chainId") t.gate.open = false;
    },
  );
  const thrown = await t.guard.client
    .sendTransaction({ account, chain: mainnet, to: account, value: 1n })
    .catch((e) => e);
  expect(t.guard.isHeldBack(thrown)).toBe(true);
  expect(t.reached).toEqual(["eth_chainId"]);
  expect(t.submitted()).toBe(0);
});

test("the client is the wallet's account, and nothing of it goes around the guard", async () => {
  const t = setup();
  expect(t.guard.client.account?.address).toBe(account);
  t.gate.open = false;
  const raw = t.guard.client.transport.request as (args: {
    method: string;
  }) => Promise<unknown>;
  expect(
    await raw({ method: "eth_sendTransaction" }).catch((e) => e),
  ).toBeInstanceOf(NotPassed);
  expect(t.reached).toEqual([]);
});
