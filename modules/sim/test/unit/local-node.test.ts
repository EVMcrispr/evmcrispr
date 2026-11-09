import "../setup";
import { afterAll, describe, expect, it } from "bun:test";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { http } from "viem";
import { LOCAL_RPC, localNodeUrl } from "../../src/lib/forks";

// `sim:fork --using anvil` swaps the state of one anvil. Which anvil: the
// one the script's chain already reads from, when that is a local anvil;
// otherwise the default one on 8545.

const asked: { url: string; probed: string[] } = { url: "", probed: [] };
const probe = async (url: string) => {
  asked.probed.push(url);
  return url === "http://127.0.0.1:8600";
};

describe("the anvil a fork swaps", () => {
  it("is the chain's own RPC when that is a local anvil", async () => {
    expect(await localNodeUrl("http://127.0.0.1:8600", probe)).toBe(
      "http://127.0.0.1:8600",
    );
    expect(await localNodeUrl("http://localhost:8600/", probe)).toBe(LOCAL_RPC);
  });

  it("is the default one for a remote RPC or a local node that is not an anvil", async () => {
    asked.probed = [];
    expect(await localNodeUrl("https://rpc.gnosischain.com", probe)).toBe(
      LOCAL_RPC,
    );
    expect(await localNodeUrl(undefined, probe)).toBe(LOCAL_RPC);
    expect(asked.probed).toEqual([]);
    expect(await localNodeUrl("http://127.0.0.1:14337/rpc", probe)).toBe(
      LOCAL_RPC,
    );
  });
});

// A fake anvil: it records what it is asked, and answers as an anvil forked
// from an upstream. Anvil up to 1.5 reports that upstream in
// `anvil_nodeInfo`; later versions redact it to its origin.
const COMPLETE = "https://upstream.invalid/gnosis/secret";
const REDACTED = "https://upstream.invalid/";
const fake = { forkUrl: COMPLETE };
const calls: string[] = [];
const resets: unknown[][] = [];
const node = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = (await req.json()) as {
      id: number;
      method: string;
      params?: unknown[];
    }[] & { id: number; method: string; params?: unknown[] };
    const answer = ({
      id,
      method,
      params,
    }: {
      id: number;
      method: string;
      params?: unknown[];
    }) => {
      calls.push(method);
      if (method === "anvil_reset") resets.push(params ?? []);
      const result: Record<string, unknown> = {
        anvil_nodeInfo: { forkConfig: { forkUrl: fake.forkUrl } },
        eth_chainId: "0x64",
        eth_blockNumber: "0x10",
        anvil_dumpState: "0x",
      };
      return { jsonrpc: "2.0", id, result: result[method] ?? null };
    };
    return Response.json(Array.isArray(body) ? body.map(answer) : answer(body));
  },
});
afterAll(() => node.stop(true));

const url = () => `http://127.0.0.1:${node.port}`;
const run = (script: string, forkUrl: string) => {
  fake.forkUrl = forkUrl;
  calls.length = 0;
  resets.length = 0;
  const interpreter = new Interpreter(evml.registry, {
    account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    chainId: 100,
    transports: {
      100: http(url()),
      1: http("https://mainnet.invalid/secret"),
    },
  });
  return interpreter.interpret(script);
};
const forkedFrom = (params: unknown[]) =>
  (params[0] as { forking?: { jsonRpcUrl?: string } } | undefined)?.forking
    ?.jsonRpcUrl;

describe("sim:fork --using anvil", () => {
  it("resets the anvil the chain's RPC points at", async () => {
    await run("load sim\nsim:fork --using anvil (\n)", COMPLETE).catch(
      () => {},
    );
    expect(calls).toContain("anvil_reset");
  });

  it("re-forks that anvil's own upstream without naming it, which anvil keeps even when it redacts it", async () => {
    for (const forkUrl of [COMPLETE, REDACTED]) {
      await run("load sim\nsim:fork --using anvil (\n)", forkUrl).catch(
        () => {},
      );
      expect(resets.length).toBeGreaterThan(0);
      // Never a bare reset: that drops anvil out of fork mode.
      for (const params of resets) {
        expect(params).toHaveLength(1);
        expect(forkedFrom(params)).toBeUndefined();
      }
    }
  });

  it("comes back to that upstream by its URL after another chain, when anvil reports it", async () => {
    await run(
      "load sim\nsim:fork --using anvil (\n  switch 1\n  switch 100\n)",
      COMPLETE,
    ).catch(() => {});
    expect(resets.map(forkedFrom)).toEqual([
      undefined,
      "https://mainnet.invalid/secret",
      COMPLETE,
    ]);
  });

  it("says why it cannot come back when anvil redacted that URL", async () => {
    const error = await run(
      "load sim\nsim:fork --using anvil (\n  switch 1\n  switch 100\n)",
      REDACTED,
    ).then(
      () => undefined,
      (e: Error) => e.message,
    );
    expect(error).toContain("does not report the URL it forks");
    // It stops instead of resetting into an empty, unforked chain.
    expect(resets.map(forkedFrom)).toEqual([
      undefined,
      "https://mainnet.invalid/secret",
    ]);
  });
});
