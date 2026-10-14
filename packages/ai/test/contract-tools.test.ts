import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  CONTRACT_API_URL,
  clearContractSourceCache,
  clearContractVerificationCache,
  setContractApi,
  setEtherscanProxy,
} from "@evmcrispr/sdk";
import { createContractTools } from "../src/index";

const ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// biome-ignore-start lint/suspicious/noExplicitAny: the SDK's tool type hides its schema and its execute.
const schema = (tool: unknown) => (tool as any).inputSchema;
const run = (tool: unknown, input: unknown): Promise<string> =>
  (tool as any).execute(schema(tool).parse(input), {
    toolCallId: "call",
    messages: [],
  });
// biome-ignore-end lint/suspicious/noExplicitAny: see above.

const realFetch = globalThis.fetch;
const realKey = process.env.VITE_ETHERSCAN_API_KEY;
let requested: string[] = [];

/** Stub fetch: answers by URL path, records every URL; anything else 404s. */
function stubFetch(byPath: Record<string, unknown>): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    requested.push(`${url.hostname}${url.pathname}`);
    const body = byPath[url.pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
}

beforeEach(() => {
  requested = [];
  clearContractVerificationCache();
  clearContractSourceCache();
  // A browser build: no key, no proxy.
  delete process.env.VITE_ETHERSCAN_API_KEY;
  setEtherscanProxy(undefined);
  setContractApi(CONTRACT_API_URL);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setContractApi(CONTRACT_API_URL);
  if (realKey === undefined) delete process.env.VITE_ETHERSCAN_API_KEY;
  else process.env.VITE_ETHERSCAN_API_KEY = realKey;
});

test("get_contract reads a contract without an Etherscan key", async () => {
  stubFetch({
    [`/source/1/${ROUTER}`]: {
      name: "UniswapV2Router02",
      abi: [
        {
          type: "function",
          name: "WETH",
          inputs: [],
          outputs: [{ name: "", type: "address" }],
          stateMutability: "pure",
        },
      ],
      compilerVersion: "0.6.6+commit.6c089d02",
      optimizationUsed: true,
      runs: 999999,
      isProxy: false,
      files: {
        "contracts/UniswapV2Router02.sol": "contract UniswapV2Router02 {}",
      },
    },
  });
  const { get_contract } = createContractTools(() => 1);

  const overview = await run(get_contract, { address: ROUTER });
  expect(overview).not.toContain("ERROR");
  expect(overview).toContain("UniswapV2Router02");
  expect(overview).toContain("function WETH() pure returns (address)");
  expect(overview).toContain("contracts/UniswapV2Router02.sol");
  // Sourcify (a 404 here), then one request to the API: `/source`
  // carries the metadata too.
  expect(requested).toEqual([
    `sourcify.dev/server/v2/contract/1/${ROUTER}`,
    `api.evmcrispr.com/source/1/${ROUTER}`,
  ]);

  const file = await run(get_contract, {
    address: ROUTER,
    file: "UniswapV2Router02.sol",
  });
  expect(file).toContain("contract UniswapV2Router02 {}");
});

test("get_contract says so when no explorer has the contract", async () => {
  stubFetch({});
  const { get_contract } = createContractTools(() => 1);

  const answer = await run(get_contract, { address: ROUTER });
  expect(answer).toStartWith(`ERROR: no verified source for ${ROUTER}`);
  // It tried: Sourcify, the API, then Blockscout.
  expect(requested).toEqual([
    `sourcify.dev/server/v2/contract/1/${ROUTER}`,
    `api.evmcrispr.com/source/1/${ROUTER}`,
    "eth.blockscout.com/api",
  ]);
});
