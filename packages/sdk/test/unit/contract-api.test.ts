import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";

import {
  CONTRACT_API_URL,
  clearContractSourceCache,
  clearContractVerificationCache,
  fetchContractSource,
  fetchVerifiedContract,
  SOURCIFY_URL,
  setContractApi,
  setEtherscanProxy,
  setSourcifyApi,
} from "../../src";

/* Fixtures of the shared msw handlers: verified on the Etherscan mock, the
 * mainnet Blockscout mock and the EVMcrispr API mock alike, and not on the
 * Sourcify mock, which answers 404 for them. */
const VERIFIED = "0x0000000000000000000000000000000000001234";
const PROXY = "0x0000000000000000000000000000000000005678";
/* Recorded Sourcify answers in the Sourcify mock. */
const ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const server = createTestServer();
const realKey = process.env.VITE_ETHERSCAN_API_KEY;
let hosts: string[] = [];
let paths: string[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    hosts.push(url.hostname);
    paths.push(`${url.hostname}${url.pathname}`);
  });
});

afterAll(() => server.close());

beforeEach(() => {
  hosts = [];
  paths = [];
  clearContractVerificationCache();
  clearContractSourceCache();
  delete process.env.VITE_ETHERSCAN_API_KEY;
  setEtherscanProxy(undefined);
  setContractApi(CONTRACT_API_URL);
  setSourcifyApi(SOURCIFY_URL);
});

afterEach(() => {
  server.resetHandlers();
  setEtherscanProxy(undefined);
  setContractApi(CONTRACT_API_URL);
  setSourcifyApi(SOURCIFY_URL);
  if (realKey === undefined) delete process.env.VITE_ETHERSCAN_API_KEY;
  else process.env.VITE_ETHERSCAN_API_KEY = realKey;
});

describe("verified contracts without a key or a proxy", () => {
  it("come from Sourcify first, without asking the API", async () => {
    const info = await fetchVerifiedContract(1, ROUTER);
    expect(info).to.deep.equal({
      name: "UniswapV2Router02",
      compilerVersion: "0.6.6+commit.6c089d02",
      optimizationUsed: true,
      runs: 999999,
      license: undefined,
      matchType: "partial",
      isProxy: false,
      implementation: undefined,
    });
    expect(paths).to.deep.equal([
      `sourcify.dev/server/v2/contract/1/${ROUTER}`,
    ]);

    const source = await fetchContractSource(1, ROUTER);
    expect(source?.name).to.equal("UniswapV2Router02");
    expect(source?.evmVersion).to.equal("istanbul");
    expect(source?.abi).to.include("function WETH() view returns (address)");
    expect(source?.files["UniswapV2Router02.sol"]).to.include(
      "pragma solidity",
    );
    expect(hosts).to.deep.equal(["sourcify.dev", "sourcify.dev"]);
  });

  it("take a proxy from Sourcify without its implementation", async () => {
    const source = await fetchContractSource(1, USDC);
    expect(source?.name).to.equal("FiatTokenProxy");
    expect(source?.isProxy).to.be.true;
    expect(source?.implementation).to.be.undefined;
    expect(Object.keys(source?.files ?? {})).to.deep.equal([
      "FiatTokenProxy.sol",
    ]);
    expect(hosts).to.deep.equal(["sourcify.dev"]);
  });

  it("go on to the API when Sourcify fails", async () => {
    server.use(
      http.get(
        "https://sourcify.dev/server/v2/contract/:chainId/:address",
        () => new HttpResponse("upstream down", { status: 502 }),
      ),
    );
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info?.name).to.equal("Verified");
    expect(hosts).to.deep.equal(["sourcify.dev", "api.evmcrispr.com"]);

    server.use(
      http.get(
        "https://sourcify.dev/server/v2/contract/:chainId/:address",
        () => HttpResponse.error(),
      ),
    );
    const source = await fetchContractSource(1, VERIFIED);
    expect(source?.name).to.equal("Verified");
    expect(hosts.slice(2)).to.deep.equal(["sourcify.dev", "api.evmcrispr.com"]);
  });

  it("go straight to the API with Sourcify switched off", async () => {
    setSourcifyApi(undefined);
    const info = await fetchVerifiedContract(1, ROUTER);
    expect(info).to.be.null;
    expect(hosts).to.deep.equal(["api.evmcrispr.com", "eth.blockscout.com"]);
  });

  it("come from the EVMcrispr API when Sourcify answers 404", async () => {
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info).to.deep.equal({
      name: "Verified",
      compilerVersion: "0.8.20+commit.a1b79de6",
      optimizationUsed: true,
      runs: 200,
      license: "MIT",
      matchType: "perfect",
      isProxy: false,
      implementation: undefined,
    });
    expect(paths).to.deep.equal([
      `sourcify.dev/server/v2/contract/1/${VERIFIED}`,
      `api.evmcrispr.com/contract/1/${VERIFIED}`,
    ]);
  });

  it("read a source, metadata and files, in one request to the API", async () => {
    const source = await fetchContractSource(1, VERIFIED);
    expect(source?.name).to.equal("Verified");
    expect(source?.evmVersion).to.equal("paris");
    expect(source?.license).to.equal("MIT");
    expect(source?.abi).to.deep.equal([]);
    expect(Object.keys(source?.files ?? {})).to.deep.equal(["Verified.sol"]);
    expect(source?.files["Verified.sol"]).to.include("contract Verified");
    expect(paths).to.deep.equal([
      `sourcify.dev/server/v2/contract/1/${VERIFIED}`,
      `api.evmcrispr.com/source/1/${VERIFIED}`,
    ]);
  });

  it("leave a proxy's implementation for the chain to tell", async () => {
    const info = await fetchVerifiedContract(1, PROXY);
    expect(info?.isProxy).to.be.true;
    expect(info?.implementation).to.be.undefined;
    expect(hosts).to.deep.equal(["sourcify.dev", "api.evmcrispr.com"]);
  });

  it("fall back to Blockscout when the API answers 404", async () => {
    const notVerified = () =>
      HttpResponse.json({ error: "contract not verified" }, { status: 404 });
    server.use(
      http.get(
        "https://api.evmcrispr.com/contract/:chainId/:address",
        notVerified,
      ),
      http.get(
        "https://api.evmcrispr.com/source/:chainId/:address",
        notVerified,
      ),
    );
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info?.name).to.equal("Verified");
    expect(hosts).to.deep.equal([
      "sourcify.dev",
      "api.evmcrispr.com",
      "eth.blockscout.com",
    ]);

    const source = await fetchContractSource(1, VERIFIED);
    expect(source?.files["Verified.sol"]).to.include("contract Verified");
    expect(hosts.slice(3)).to.deep.equal([
      "sourcify.dev",
      "api.evmcrispr.com",
      "eth.blockscout.com",
    ]);
  });

  it("are null when neither the API nor Blockscout has them", async () => {
    const unknown = "0x000000000000000000000000000000000000dEaD";
    expect(await fetchVerifiedContract(1, unknown)).to.be.null;
    expect(hosts).to.deep.equal([
      "sourcify.dev",
      "api.evmcrispr.com",
      "eth.blockscout.com",
    ]);
  });

  it("go straight to Blockscout with Sourcify and the API switched off", async () => {
    setSourcifyApi(undefined);
    setContractApi(undefined);
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info?.name).to.equal("Verified");
    expect(hosts).to.deep.equal(["eth.blockscout.com"]);
  });

  it("go to another API base when one is set", async () => {
    setContractApi("https://api.example/");
    server.use(
      http.get("https://api.example/contract/:chainId/:address", () =>
        HttpResponse.json({
          name: "Elsewhere",
          abi: [],
          compilerVersion: "0.8.24+commit.e11b9ed9",
          optimizationUsed: false,
          runs: 200,
          isProxy: false,
          files: ["Elsewhere.sol"],
        }),
      ),
    );
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info?.name).to.equal("Elsewhere");
    expect(info?.runs).to.equal(0);
    expect(paths).to.deep.equal([
      `sourcify.dev/server/v2/contract/1/${VERIFIED}`,
      `api.example/contract/1/${VERIFIED}`,
    ]);
  });
});

describe("verified contracts with a way to Etherscan", () => {
  it("come from Etherscan with a key, asking neither Sourcify nor the API", async () => {
    process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    const info = await fetchVerifiedContract(1, PROXY);
    expect(info?.name).to.equal("TransparentUpgradeableProxy");
    // Etherscan itself reports the implementation.
    expect(info?.implementation).to.equal(
      "0xBEeFbeefbEefbeEFbeEfbEEfBEeFbeEfBeEfBeef",
    );
    const source = await fetchContractSource(1, VERIFIED);
    expect(source?.name).to.equal("Verified");
    // The Router is on Sourcify too: not asked with a key.
    expect((await fetchVerifiedContract(1, ROUTER))?.name).to.be.undefined;
    expect(hosts).to.deep.equal([
      "api.etherscan.io",
      "api.etherscan.io",
      "api.etherscan.io",
      "eth.blockscout.com",
    ]);
  });

  it("go through the proxy when one is set, asking neither Sourcify nor the API", async () => {
    setEtherscanProxy("https://api.evmcrispr.com/etherscan");
    server.use(
      http.get("https://api.evmcrispr.com/etherscan", () =>
        HttpResponse.json({
          status: "1",
          message: "OK",
          result: [{ ContractName: "ViaProxy", ABI: "[]", Proxy: "0" }],
        }),
      ),
    );
    const info = await fetchVerifiedContract(1, VERIFIED);
    expect(info?.name).to.equal("ViaProxy");
    expect(paths).to.deep.equal(["api.evmcrispr.com/etherscan"]);
  });
});
