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

// A fake anvil: it records what it is asked, and answers as an anvil
// forked from an upstream it names.
const calls: string[] = [];
const node = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = (await req.json()) as {
      id: number;
      method: string;
    }[] & { id: number; method: string };
    const answer = ({ id, method }: { id: number; method: string }) => {
      calls.push(method);
      const result: Record<string, unknown> = {
        anvil_nodeInfo: { forkConfig: { forkUrl: "https://upstream.invalid" } },
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

describe("sim:fork --using anvil", () => {
  it("resets the anvil the chain's RPC points at", async () => {
    const url = `http://127.0.0.1:${node.port}`;
    const interpreter = new Interpreter(evml.registry, {
      account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      chainId: 100,
      transports: { 100: http(url) },
    });
    await interpreter
      .interpret("load sim\nsim:fork --using anvil (\n)")
      .catch(() => {});
    expect(calls).toContain("anvil_reset");
  });
});
