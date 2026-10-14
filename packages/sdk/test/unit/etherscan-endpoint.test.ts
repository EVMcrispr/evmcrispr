import { afterEach, beforeEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import {
  clearAddressTransactionsCache,
  clearContractVerificationCache,
  ETHERSCAN_PROXY_URL,
  etherscanUrl,
  fetchAddressTransactions,
  fetchContractCreation,
  fetchVerifiedContract,
  hasEtherscanAccess,
  setEtherscanProxy,
} from "../../src";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const PROXY = "https://api.example/etherscan";

const SOURCE = {
  status: "1",
  message: "OK",
  result: [
    {
      SourceCode: "contract WXDAI {}",
      ABI: "[]",
      ContractName: "WXDAI",
      CompilerVersion: "v0.4.22+commit.4cb486ee",
      OptimizationUsed: "0",
      Runs: "200",
      EVMVersion: "Default",
      Proxy: "0",
      Implementation: "",
    },
  ],
};
const TXLIST = {
  status: "1",
  message: "OK",
  result: [
    {
      hash: "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13",
      from: "0xced608aa29bb92185d9b6340adcbfa263dae075b",
      to: WXDAI.toLowerCase(),
      value: "1",
      blockNumber: "1",
      timeStamp: "1595862470",
      isError: "0",
    },
  ],
};
const CREATION = {
  status: "1",
  message: "OK",
  result: [
    {
      contractAddress: WXDAI.toLowerCase(),
      contractCreator: "0xced608aa29bb92185d9b6340adcbfa263dae075b",
      txHash:
        "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13",
      creationBytecode: "0x6080",
    },
  ],
};

const realFetch = globalThis.fetch;
const realKey = process.env.VITE_ETHERSCAN_API_KEY;
let requested: URL[] = [];

/** Stub fetch: answers by the request's `action`, records every URL. */
function stubFetch(byAction: Record<string, unknown>): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    requested.push(url);
    const body = byAction[url.searchParams.get("action") ?? ""];
    if (body === undefined) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
}

beforeEach(() => {
  requested = [];
  clearContractVerificationCache();
  clearAddressTransactionsCache();
  delete process.env.VITE_ETHERSCAN_API_KEY;
  setEtherscanProxy(undefined);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setEtherscanProxy(undefined);
  if (realKey === undefined) delete process.env.VITE_ETHERSCAN_API_KEY;
  else process.env.VITE_ETHERSCAN_API_KEY = realKey;
});

describe("where Etherscan requests go", () => {
  it("nowhere, with neither a key nor a proxy", () => {
    expect(hasEtherscanAccess()).to.be.false;
    expect(etherscanUrl(1, "contract", "getsourcecode")).to.be.undefined;
  });

  it("straight to Etherscan with a key of one's own", () => {
    process.env.VITE_ETHERSCAN_API_KEY = "my-key";
    expect(hasEtherscanAccess()).to.be.true;

    const url = etherscanUrl(100, "contract", "getsourcecode");
    expect(url?.origin + (url?.pathname ?? "")).to.equal(
      "https://api.etherscan.io/v2/api",
    );
    expect(url?.searchParams.get("apikey")).to.equal("my-key");
    expect(url?.searchParams.get("chainid")).to.equal("100");
    expect(url?.searchParams.get("module")).to.equal("contract");
    expect(url?.searchParams.get("action")).to.equal("getsourcecode");
  });

  it("through the proxy, with no key in the request, when the host set one", () => {
    setEtherscanProxy(PROXY);
    expect(hasEtherscanAccess()).to.be.true;

    const url = etherscanUrl(100, "account", "txlist");
    expect(url?.origin + (url?.pathname ?? "")).to.equal(PROXY);
    expect(url?.searchParams.has("apikey")).to.be.false;
    expect(url?.searchParams.get("chainid")).to.equal("100");
    expect(url?.searchParams.get("module")).to.equal("account");
    expect(url?.searchParams.get("action")).to.equal("txlist");
  });

  it("prefers a key of one's own over the proxy", () => {
    setEtherscanProxy(PROXY);
    process.env.VITE_ETHERSCAN_API_KEY = "my-key";
    expect(etherscanUrl(1, "contract", "getsourcecode")?.hostname).to.equal(
      "api.etherscan.io",
    );
  });

  it("offers the EVMcrispr API as the proxy to set", () => {
    expect(ETHERSCAN_PROXY_URL).to.equal("https://api.evmcrispr.com/etherscan");
  });
});

describe("Etherscan lookups through the proxy", () => {
  beforeEach(() => setEtherscanProxy(PROXY));

  it("reads a verified contract", async () => {
    stubFetch({ getsourcecode: SOURCE });

    const info = await fetchVerifiedContract(100, WXDAI);
    expect(info?.name).to.equal("WXDAI");
    expect(requested).to.have.length(1);
    expect(requested[0].origin + requested[0].pathname).to.equal(PROXY);
    expect(requested[0].searchParams.get("address")).to.equal(WXDAI);
    expect(requested[0].searchParams.has("apikey")).to.be.false;
  });

  it("lists an address's transactions", async () => {
    stubFetch({ txlist: TXLIST });

    const txs = await fetchAddressTransactions(100, WXDAI, 5);
    expect(txs?.length).to.equal(1);
    expect(requested[0].origin + requested[0].pathname).to.equal(PROXY);
    expect(requested[0].searchParams.get("chainid")).to.equal("100");
    expect(requested[0].searchParams.get("offset")).to.equal("5");
    expect(requested[0].searchParams.has("apikey")).to.be.false;
  });

  it("reads a contract's creation code", async () => {
    stubFetch({ getcontractcreation: CREATION });

    const creation = await fetchContractCreation(100, WXDAI);
    expect(creation?.creationBytecode).to.equal("0x6080");
    expect(requested[0].origin + requested[0].pathname).to.equal(PROXY);
    expect(requested[0].searchParams.get("contractaddresses")).to.equal(WXDAI);
    expect(requested[0].searchParams.has("apikey")).to.be.false;
  });

  it("still falls back to Blockscout when the proxy has no answer", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requested.push(url);
      if (url.hostname === "gnosisscan.io") return Response.json(TXLIST);
      return new Response("rate limited", { status: 429 });
    }) as typeof fetch;

    const txs = await fetchAddressTransactions(100, WXDAI, 5);
    expect(txs?.length).to.equal(1);
    expect(requested.map((u) => u.hostname)).to.deep.equal([
      "api.example",
      "gnosisscan.io",
    ]);
  });
});
