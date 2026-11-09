import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { experimentalModuleChains } from "@evmcrispr/modules/chains";
import type { Action } from "@evmcrispr/sdk";
import { ALT_MEMPOOL_GATEWAY } from "@evmcrispr/viem-frames";
import { createWalletClient, custom, type WalletClient } from "viem";
import { networks } from "../../src/config/rpc";
import { ensureAltMempoolChain } from "../../src/wallet/alt-mempool-chain";
import { testBrowser } from "../helpers/app";
import { fakeEvml, type Step } from "../helpers/fake-evml";
import { OWNER } from "../helpers/frame-gateway";
import { settle } from "../helpers/tabs";

const MISMATCH = `Your wallet's chain 1337 is not the alt-mempool devnet: set its RPC to ${ALT_MEMPOOL_GATEWAY}`;
const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});
const hex = (n: number) => `0x${n.toString(16)}`;

/** A chain as a node serves it: blocks 0…latest, each under its own hash. */
function node(seed: string, latest: number) {
  const state = { latest };
  const hashOf = (n: number) =>
    `0x${seed.repeat(31)}${n.toString(16).padStart(2, "0")}`;
  const block = (tag: string) => {
    const n = tag === "latest" ? state.latest : Number(tag);
    return n > state.latest ? null : { number: hex(n), hash: hashOf(n) };
  };
  return { state, hashOf, block };
}
type Node = ReturnType<typeof node>;

/** The gateway, serving the devnet's blocks. */
function gateway(chain: Node) {
  const calls: { method: string; params: any }[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      if (method === "eth_chainId") return "0x539";
      if (method === "eth_getBlockByNumber") return chain.block(params[0]);
      throw new Error(`unexpected ${method}`);
    },
  });
  return { transport, calls };
}

/** MetaMask: on `chainId`, its chain-1337 network served by `local` until
 *  adding the gateway makes it the devnet's (when `addTakes`). */
function wallet({
  chainId,
  local,
  devnet,
  addTakes = true,
  add,
}: {
  chainId: number;
  local: Node;
  devnet: Node;
  addTakes?: boolean;
  add?: () => Promise<void>;
}) {
  const asked: { method: string; params: any }[] = [];
  const state = { chainId, network: local };
  const other = node("ee", 7);
  const client: WalletClient = createWalletClient({
    account: OWNER.address,
    transport: custom({
      async request({ method, params }: { method: string; params: any }) {
        asked.push({ method, params });
        switch (method) {
          case "eth_chainId":
            return hex(state.chainId);
          case "eth_accounts":
            return [OWNER.address];
          case "wallet_addEthereumChain":
            await add?.();
            if (addTakes) state.network = devnet;
            return null;
          case "wallet_switchEthereumChain":
            state.chainId = Number(params[0].chainId);
            return null;
          case "eth_getBlockByNumber":
            return (state.chainId === 1337 ? state.network : other).block(
              params[0],
            );
          case "eth_sendTransaction":
          case "personal_sign":
            return `0x${"22".repeat(32)}`;
          default:
            throw new Error(`unexpected ${method}`);
        }
      },
    }),
  });
  return { client, asked, state, methods: () => asked.map((r) => r.method) };
}

const switchTo = (chainId: number): Action => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId: hex(chainId) }],
});
const tx: Action = {
  to: "0x000000000000000000000000000000000000dEaD",
  data: "0x01",
};

let flag: string | undefined;
beforeEach(() => {
  flag = process.env.VITE_PUBLIC_EXPERIMENTAL;
  process.env.VITE_PUBLIC_EXPERIMENTAL = "true";
});
afterEach(() => {
  if (flag === undefined) delete process.env.VITE_PUBLIC_EXPERIMENTAL;
  else process.env.VITE_PUBLIC_EXPERIMENTAL = flag;
});

describe("ensureAltMempoolChain", () => {
  test("adds the gateway before switching to 1337", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1, local: node("aa", 5), devnet });
    const gw = gateway(devnet);
    await ensureAltMempoolChain(mm.client, undefined, {
      transport: gw.transport,
    });
    const methods = mm.methods();
    const added = methods.indexOf("wallet_addEthereumChain");
    expect(added).toBeGreaterThanOrEqual(0);
    expect(added).toBeLessThan(methods.indexOf("wallet_switchEthereumChain"));
    expect(mm.asked[added].params[0]).toMatchObject({
      chainId: "0x539",
      chainName: "Alt-mempool devnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: [ALT_MEMPOOL_GATEWAY],
    });
    expect(mm.state.chainId).toBe(1337);
    // The wallet's latest block was looked up on the gateway.
    expect(
      gw.calls.some(
        (c) => c.method === "eth_getBlockByNumber" && c.params[0] === "0x20",
      ),
    ).toBe(true);
  });

  test("stops when the wallet's chain 1337 is not the gateway's", async () => {
    const devnet = node("dd", 0x20);
    // MetaMask keeps its own chain-1337 network: a localhost far ahead,
    // and one whose block of the same number differs.
    for (const local of [node("aa", 5), node("aa", 0x40), node("bb", 0x20)]) {
      const mm = wallet({ chainId: 1, local, devnet, addTakes: false });
      await expect(
        ensureAltMempoolChain(mm.client, undefined, {
          transport: gateway(devnet).transport,
          retryMs: 0,
        }),
      ).rejects.toThrow(MISMATCH);
    }
  });

  test("a wallet a few blocks behind the gateway passes", async () => {
    const devnet = node("dd", 0x20);
    // The wallet's node is at 0x20, the gateway already at 0x23.
    const mm = wallet({ chainId: 1337, local: node("dd", 0x20), devnet });
    devnet.state.latest = 0x23;
    await ensureAltMempoolChain(mm.client, undefined, {
      transport: gateway(devnet).transport,
    });
    expect(mm.methods()).not.toContain("wallet_addEthereumChain");
  });

  test("a gateway behind the wallet is asked again, then compared at its latest", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1337, local: devnet, devnet });
    const ahead = node("dd", 0x22);
    mm.state.network = ahead;
    const gw = gateway(devnet);
    await ensureAltMempoolChain(mm.client, undefined, {
      transport: gw.transport,
      retryMs: 0,
    });
    const reads = gw.calls
      .filter((c) => c.method === "eth_getBlockByNumber")
      .map((c) => c.params[0]);
    expect(reads).toEqual(["0x22", "0x22", "latest"]);
  });

  test("a wallet already on the devnet is not asked to add it", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1337, local: devnet, devnet });
    await ensureAltMempoolChain(mm.client, undefined, {
      transport: gateway(devnet).transport,
    });
    expect(mm.methods()).not.toContain("wallet_addEthereumChain");
    expect(mm.methods()).not.toContain("wallet_switchEthereumChain");
  });

  test("a wallet's own text never reaches the error unescaped", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({
      chainId: 1337,
      local: devnet,
      devnet,
      addTakes: false,
    });
    mm.state.network = {
      ...devnet,
      block: () => ({ number: "0x5", hash: "‮evil" }),
    } as unknown as Node;
    const error = await ensureAltMempoolChain(mm.client, undefined, {
      transport: gateway(devnet).transport,
      retryMs: 0,
    }).catch((e: Error) => e);
    expect((error as Error).message).toBe(MISMATCH);
  });
});

/** A run of `steps` with `mm` as the wallet and `gw` as the gateway. */
async function run(
  steps: Step[],
  mm: ReturnType<typeof wallet>,
  gw: ReturnType<typeof gateway>,
) {
  const browser = testBrowser();
  const evml = fakeEvml(steps, async () => undefined);
  const app = browser.tab({
    evml: () => evml,
    frameGateway: gw.transport,
    wallet: async () => ({ client: mm.client, address: OWNER.address }),
  });
  const id = await app.spaces.create({ text: "a", source: "user" });
  app.spaces.show(id);
  const started = await app.runs.start(id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  const record = () => app.runs.store.getState()[started.runId].record;
  return { app, started, record };
}

describe("the terminal's chain 1337", () => {
  test("a run stops before any transaction when the wallet's 1337 is not the devnet", async () => {
    const devnet = node("dd", 0x20);
    const gw = gateway(devnet);
    for (const steps of [
      [{ action: switchTo(1337) }, { action: tx }],
      [{ chain: 1337 }, { action: tx }],
    ] as Step[][]) {
      const mm = wallet({
        chainId: 1,
        local: node("aa", 5),
        devnet,
        addTakes: false,
      });
      const r = await run(steps, mm, gw);
      expect(await r.started.ended).toBe("error");
      expect(r.record().errors).toEqual([MISMATCH]);
      expect(mm.methods()).not.toContain("eth_sendTransaction");
    }
  });

  test("a run reaches the devnet through the gateway's network, then sends", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1, local: node("aa", 5), devnet });
    const r = await run(
      [{ chain: 1337 }, { action: switchTo(1337) }, { action: tx }],
      mm,
      gateway(devnet),
    );
    expect(await r.started.ended).toBe("success");
    const methods = mm.methods();
    expect(methods.indexOf("wallet_addEthereumChain")).toBeLessThan(
      methods.indexOf("eth_sendTransaction"),
    );
  });

  test("MetaMask refusing to add the gateway pauses the run as declined", async () => {
    const devnet = node("dd", 0x20);
    let asked = 0;
    const mm = wallet({
      chainId: 1,
      local: node("aa", 5),
      devnet,
      add: async () => {
        if (++asked === 1) throw refusal;
      },
    });
    const r = await run(
      [{ action: switchTo(1337) }, { action: tx }],
      mm,
      gateway(devnet),
    );
    await settle();
    expect(r.record().status).toBe("paused");
    expect(r.record().pausedBy).toBe("declined");
    expect(mm.methods()).not.toContain("eth_sendTransaction");
    r.app.runs.resume(r.started.runId);
    expect(await r.started.ended).toBe("success");
    expect(asked).toBe(2);
  });

  test("does nothing for other chains", async () => {
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1, local: node("aa", 5), devnet });
    const gw = gateway(devnet);
    const r = await run(
      [{ chain: 100 }, { action: switchTo(100) }, { action: tx }],
      mm,
      gw,
    );
    expect(await r.started.ended).toBe("success");
    expect(mm.methods()).not.toContain("wallet_addEthereumChain");
    expect(mm.methods()).not.toContain("eth_getBlockByNumber");
    expect(gw.calls).toHaveLength(0);
  });

  test("chain 1337 and the experimental modules' chains are absent when the experimental flag is off", async () => {
    const off = networks(false);
    expect(off.chains.some((c) => c.id === 1337)).toBe(false);
    expect(off.rpcUrls[1337]).toBeUndefined();
    expect(off.transports[1337]).toBeUndefined();
    const on = networks(true);
    const devnetChain = on.chains.find((c) => c.id === 1337);
    expect(devnetChain?.name).toBe("Alt-mempool devnet");
    expect(on.rpcUrls[1337]).toBe(ALT_MEMPOOL_GATEWAY);
    // Everything else is as it was, but for the experimental modules' own
    // chains (the frames devnets), which are listed only with the flag on.
    const experimental = experimentalModuleChains.map((c) => c.id);
    expect(experimental).toEqual(expect.arrayContaining([81411, 81412]));
    for (const id of experimental) {
      expect(off.chains.some((c) => c.id === id)).toBe(false);
      expect(on.chains.some((c) => c.id === id)).toBe(true);
    }
    expect(
      on.chains.filter((c) => c.id !== 1337 && !experimental.includes(c.id)),
    ).toEqual(
      off.chains
        .filter((c) => !experimental.includes(c.id))
        .map((c) => expect.objectContaining({ id: c.id, name: c.name })),
    );
    // Their RPCs are the user's machine, never the hosted proxy.
    expect(on.rpcUrls[81411]).toBe("http://127.0.0.1:8570");
    expect(on.rpcUrls[81412]).toBe("http://127.0.0.1:32003");

    // And a run with the flag off asks nothing of the gateway.
    process.env.VITE_PUBLIC_EXPERIMENTAL = "false";
    const devnet = node("dd", 0x20);
    const mm = wallet({ chainId: 1, local: node("aa", 5), devnet });
    const gw = gateway(devnet);
    const r = await run([{ action: switchTo(1337) }, { action: tx }], mm, gw);
    expect(await r.started.ended).toBe("success");
    expect(mm.methods()).not.toContain("wallet_addEthereumChain");
    expect(gw.calls).toHaveLength(0);
  });
});
