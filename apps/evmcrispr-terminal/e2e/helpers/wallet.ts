import type { BrowserContext, Page } from "@playwright/test";

/** Anvil's first default account. Nothing is ever sent from it here. */
export const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

declare global {
  interface Window {
    __wallet: {
      /** The method of every request the wallet was shown, in order. */
      prompts: string[];
      /** Requests waiting for the person at the wallet. */
      waiting(): number;
      confirm(): void;
      decline(): void;
    };
  }
}

/**
 * An injected wallet the test plays the person at: it is connected to
 * mainnet as `ACCOUNT`, and holds every transaction until the test
 * confirms or declines it. No transaction exists anywhere: the chain's RPC
 * is answered here too, with a mined receipt for whatever hash is asked.
 */
export async function installWallet(context: BrowserContext) {
  await context.addInitScript((account) => {
    type Pending = { resolve(hash: string): void; reject(error: Error): void };
    const pending: Pending[] = [];
    const prompts: string[] = [];
    let sent = 0;
    window.__wallet = {
      prompts,
      waiting: () => pending.length,
      confirm: () =>
        pending.shift()?.resolve(`0x${String(++sent).padStart(64, "0")}`),
      decline: () =>
        pending.shift()?.reject(
          Object.assign(new Error("User rejected the request."), {
            code: 4001,
          }),
        ),
    };
    (window as unknown as { ethereum: unknown }).ethereum = {
      on() {},
      removeListener() {},
      async request({ method }: { method: string }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [account];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_getCapabilities") return {};
        if (method !== "eth_sendTransaction")
          throw Object.assign(new Error(`Unsupported: ${method}`), {
            code: 4200,
          });
        prompts.push(method);
        return new Promise<string>((resolve, reject) =>
          pending.push({ resolve, reject }),
        );
      },
    };
    // wagmi connects by itself to the wallet it was last connected to.
    localStorage.setItem("wagmi.recentConnectorId", '"injected"');
    localStorage.setItem("wagmi.injected.connected", "true");
  }, ACCOUNT);

  // Every JSON-RPC request to a node is answered from here.
  await context.route(
    (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
    async (route) => {
      const request = route.request();
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = null;
      }
      const calls = Array.isArray(body) ? body : [body];
      if (
        request.method() !== "POST" ||
        !calls.every((call) => call && typeof call.method === "string")
      )
        return route.abort();
      const answers = calls.map((call) => ({
        jsonrpc: "2.0",
        id: call.id,
        result: answer(call.method, call.params),
      }));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(body) ? answers : answers[0]),
      });
    },
  );
}

function answer(method: string, params: unknown[]): unknown {
  if (method === "eth_chainId") return "0x1";
  if (method === "eth_blockNumber") return "0x10";
  if (method === "eth_getTransactionReceipt")
    return {
      transactionHash: params[0],
      blockNumber: "0x10",
      blockHash: `0x${"cd".repeat(32)}`,
      transactionIndex: "0x0",
      from: ACCOUNT,
      to: ACCOUNT,
      cumulativeGasUsed: "0x1",
      gasUsed: "0x1",
      effectiveGasPrice: "0x1",
      contractAddress: null,
      logs: [],
      logsBloom: `0x${"00".repeat(256)}`,
      status: "0x1",
      type: "0x2",
    };
  return null;
}

export const wallet = (page: Page) => ({
  /** Resolves once the terminal is connected to the wallet. */
  connected: () =>
    page
      .getByRole("button", { name: "Disconnect" })
      .waitFor({ timeout: 15_000 }),
  prompts: () => page.evaluate(() => window.__wallet.prompts.length),
  waiting: () => page.evaluate(() => window.__wallet.waiting()),
  confirm: () => page.evaluate(() => window.__wallet.confirm()),
  decline: () => page.evaluate(() => window.__wallet.decline()),
});
