import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
  forgetChainIdentities,
  identifyChain,
} from "../../src/utils/chain-identity";
import { registerChains } from "../../src/utils/chains";

/** A node answering block 0 with `hash` (and nothing else). */
function node(hash: string) {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const { id } = (await req.json()) as { id: number };
      return Response.json({ jsonrpc: "2.0", id, result: { hash } });
    },
  });
}

const PUBLIC = `0x${"aa".repeat(32)}`;
const LOCAL = `0x${"bb".repeat(32)}`;
const publicNode = node(PUBLIC);
const localNode = node(LOCAL);
const url = (s: { port?: number }) => `http://127.0.0.1:${s.port}`;
afterAll(() => {
  publicNode.stop(true);
  localNode.stop(true);
});

registerChains(
  {
    id: 913370,
    key: "sharedDevnet",
    name: "Shared devnet",
    rpcUrl: url(publicNode),
    sharedId: true,
  },
  {
    id: 913371,
    key: "ownDevnet",
    name: "Own devnet",
    rpcUrl: "http://127.0.0.1:9",
  },
);

describe("a chain's identity", () => {
  beforeEach(forgetChainIdentities);

  it("a declaration whose id is its own is that chain, whatever the node", async () => {
    expect(await identifyChain(913371, { url: url(localNode) })).toBe(
      "declared",
    );
  });

  it("an id nothing declares is undeclared", async () => {
    expect(await identifyChain(913372, { url: url(localNode) })).toBe(
      "undeclared",
    );
  });

  it("on a shared id, a node with the declared RPC's block 0 is the declared chain", async () => {
    const wallet = async () => ({ hash: PUBLIC.toUpperCase() });
    expect(await identifyChain(913370, wallet)).toBe("declared");
    // The declared RPC itself is not asked.
    expect(await identifyChain(913370, { url: url(publicNode) })).toBe(
      "declared",
    );
  });

  it("on a shared id, a node with another block 0 is another network", async () => {
    expect(await identifyChain(913370, { url: url(localNode) })).toBe("other");
  });

  it("a node that does not say, or a declared RPC out of reach, is not taken for the declared chain", async () => {
    const silent = async () => {
      throw new Error("no");
    };
    expect(await identifyChain(913370, silent)).toBe("other");
    registerChains({
      id: 913373,
      key: "downDevnet",
      name: "Down devnet",
      rpcUrl: "http://127.0.0.1:9",
      sharedId: true,
    });
    expect(await identifyChain(913373, async () => ({ hash: PUBLIC }))).toBe(
      "other",
    );
  });
});
