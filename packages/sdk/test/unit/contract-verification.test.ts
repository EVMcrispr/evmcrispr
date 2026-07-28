import { afterEach, beforeEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import {
  clearAddressTransactionsCache,
  clearContractVerificationCache,
  fetchAddressTransactions,
  fetchVerifiedContract,
  fetchVerifiedContractFull,
  parseVerifiedSourceFiles,
} from "../../src";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

/* Minimal canned payloads matching the live shapes observed 2026-07-28. */

const BLOCKSCOUT_SINGLE = {
  status: "1",
  message: "OK",
  result: [
    {
      SourceCode: "contract WXDAI {}",
      ABI: '[{"type":"function","name":"deposit","inputs":[],"outputs":[],"stateMutability":"payable"}]',
      ContractName: "WXDAI",
      CompilerVersion: "v0.4.22+commit.4cb486ee",
      OptimizationUsed: "false",
      EVMVersion: "default",
      FileName: "contracts/WXDAI.sol",
      IsProxy: "false",
      Address: WXDAI.toLowerCase(),
    },
  ],
};

const BLOCKSCOUT_MULTI = {
  status: "1",
  message: "OK",
  result: [
    {
      SourceCode: "contract Main {}",
      ABI: "[]",
      ContractName: "Main",
      CompilerVersion: "v0.8.20+commit.a1b79de6",
      OptimizationUsed: "true",
      OptimizationRuns: 200,
      CompilerSettings: { optimizer: { enabled: true, runs: 200 } },
      EVMVersion: "paris",
      FileName: "src/Main.sol",
      IsProxy: "true",
      ImplementationAddress: "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
      ConstructorArguments: "0xdeadbeef",
      AdditionalSources: [
        { Filename: "src/Lib.sol", SourceCode: "library Lib {}" },
      ],
      Address: WXDAI.toLowerCase(),
    },
  ],
};

const ETHERSCAN_UNVERIFIED = {
  status: "1",
  message: "OK",
  result: [{ ABI: "Contract source code not verified" }],
};

const BLOCKSCOUT_TXLIST = {
  status: "1",
  message: "OK",
  result: [
    {
      hash: "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13",
      from: "0xced608aa29bb92185d9b6340adcbfa263dae075b",
      to: WXDAI.toLowerCase(),
      value: "100000000000000000",
      blockNumber: "11173946",
      timeStamp: "1595862470",
      isError: "0",
      txreceipt_status: "1",
      methodId: "0xd0e30db0",
    },
  ],
};

const realFetch = globalThis.fetch;
const realKey = process.env.VITE_ETHERSCAN_API_KEY;
let requested: string[] = [];

/** Stub fetch: routes by hostname, records every requested URL. */
function stubFetch(routes: Record<string, unknown>): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    const host = new URL(url).hostname;
    const body = routes[host];
    if (body === undefined) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
}

beforeEach(() => {
  requested = [];
  clearContractVerificationCache();
  clearAddressTransactionsCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.VITE_ETHERSCAN_API_KEY;
  else process.env.VITE_ETHERSCAN_API_KEY = realKey;
});

describe("fetchVerifiedContract (Blockscout fallback)", () => {
  it("resolves via Blockscout when no Etherscan key is set", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    stubFetch({ "gnosis.blockscout.com": BLOCKSCOUT_SINGLE });

    const info = await fetchVerifiedContract(100, WXDAI);
    expect(info?.name).to.equal("WXDAI");
    expect(info?.compilerVersion).to.equal("0.4.22+commit.4cb486ee");
    expect(info?.optimizationUsed).to.be.false;
    expect(requested.some((u) => u.includes("etherscan"))).to.be.false;
  });

  it("falls back to Blockscout when Etherscan reports unverified", async () => {
    process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    stubFetch({
      "api.etherscan.io": ETHERSCAN_UNVERIFIED,
      "gnosis.blockscout.com": BLOCKSCOUT_SINGLE,
    });

    const info = await fetchVerifiedContract(100, WXDAI);
    expect(info?.name).to.equal("WXDAI");
    expect(requested.some((u) => u.includes("api.etherscan.io"))).to.be.true;
    expect(requested.some((u) => u.includes("gnosis.blockscout.com"))).to.be
      .true;
  });

  it("returns null for chains without a Blockscout host", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    stubFetch({});

    const info = await fetchVerifiedContract(999_999, WXDAI);
    expect(info).to.be.null;
    expect(requested).to.deep.equal([]);
  });
});

describe("fetchVerifiedContractFull (Blockscout normalization)", () => {
  it("normalizes AdditionalSources into a parseable standard JSON", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    stubFetch({ "gnosis.blockscout.com": BLOCKSCOUT_MULTI });

    const entry = await fetchVerifiedContractFull(100, WXDAI);
    expect(entry?.ContractName).to.equal("Main");
    expect(entry?.OptimizationUsed).to.equal("1");
    expect(entry?.Runs).to.equal("200");
    expect(entry?.Proxy).to.equal("1");
    expect(entry?.Implementation).to.equal(
      "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
    );
    // Etherscan ships constructor args without the 0x prefix.
    expect(entry?.ConstructorArguments).to.equal("deadbeef");

    const files = parseVerifiedSourceFiles(entry ?? {});
    expect(files).to.deep.equal({
      "src/Main.sol": "contract Main {}",
      "src/Lib.sol": "library Lib {}",
    });
  });
});

describe("fetchAddressTransactions", () => {
  it("lists history via Blockscout when no key is set", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    stubFetch({ "gnosis.blockscout.com": BLOCKSCOUT_TXLIST });

    const txs = await fetchAddressTransactions(100, WXDAI, 5);
    expect(txs?.length).to.equal(1);
    expect(txs?.[0].hash).to.equal(
      "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13",
    );
    expect(txs?.[0].isError).to.be.false;
    expect(txs?.[0].timestamp).to.equal(1595862470);
  });

  it("returns null when no explorer can answer", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    stubFetch({});

    expect(await fetchAddressTransactions(999_999, WXDAI)).to.be.null;
  });
});
