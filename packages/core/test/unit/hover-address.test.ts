import { afterEach, beforeAll, describe, it } from "bun:test";
import {
  BindingsManager,
  BindingsSpace,
  clearContractVerificationCache,
} from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { setupServer } from "msw/node";
import type { Address, PublicClient } from "viem";
import { keccak256, parseEther, toHex } from "viem";
import * as viemChains from "viem/chains";
import { etherscanHandlers } from "../../../test-utils/src/msw/etherscan";
import { getHoverInfo } from "../../src/hover";
import {
  clearAddressHoverCache,
  getAddressHoverInfo,
} from "../../src/hover/address";

const EOA: Address = "0x000000000000000000000000000000000000aaaa";
const VERIFIED_CONTRACT: Address = "0x0000000000000000000000000000000000001234";
const UNVERIFIED_CONTRACT: Address =
  "0x0000000000000000000000000000000000009999";
const PROXY_CONTRACT: Address = "0x0000000000000000000000000000000000005678";
const IMPL_CONTRACT: Address = "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef";

const EIP1967_SLOT = toHex(
  BigInt(keccak256(toHex("eip1967.proxy.implementation"))) - 1n,
);

interface MockOpts {
  code?: `0x${string}`;
  balance?: bigint;
  txCount?: number;
  ensName?: string | null;
  /** EIP-1967 implementation slot value for proxy detection. */
  implementation?: Address;
}

function makeClient(opts: MockOpts): PublicClient {
  return {
    getCode: async () => opts.code ?? "0x",
    getBalance: async () => opts.balance ?? 0n,
    getTransactionCount: async () => opts.txCount ?? 0,
    getEnsName: async () => opts.ensName ?? null,
    getStorageAt: async ({ slot }: { slot: `0x${string}` }) => {
      if (
        opts.implementation &&
        slot.toLowerCase() === EIP1967_SLOT.toLowerCase()
      ) {
        return `0x${"0".repeat(24)}${opts.implementation.slice(2)}` as `0x${string}`;
      }
      return "0x";
    },
    multicall: async () => [
      { status: "failure" as const, error: {} },
      { status: "failure" as const, error: {} },
    ],
  } as unknown as PublicClient;
}

const server = setupServer(...etherscanHandlers);

describe("Core > hover > getAddressHoverInfo", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterEach(() => {
    clearAddressHoverCache();
    clearContractVerificationCache();
  });

  describe("EOAs", () => {
    it("renders an EOA card with balance and tx count", async () => {
      const client = makeClient({
        balance: parseEther("1.5"),
        txCount: 42,
        ensName: "vitalik.eth",
      });

      const result = await getAddressHoverInfo(
        EOA,
        client,
        viemChains.mainnet.id,
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**EOA**");
      expect(c).to.include("Ethereum (chainId 1)");
      expect(c).to.include("ENS: `vitalik.eth`");
      expect(c).to.include("Balance: 1.5 ETH");
      expect(c).to.include("Tx count: 42");
      expect(c).to.include("[Etherscan ↗](https://etherscan.io/address/");
    });

    it("renders a minimal EOA card when there is no client", async () => {
      const result = await getAddressHoverInfo(EOA, undefined, undefined);
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**EOA**");
      expect(c).to.include("unknown chain");
    });

    it("omits the ENS row on chains without ENS", async () => {
      const client = makeClient({
        balance: parseEther("0.1"),
        txCount: 0,
        ensName: "should-be-ignored.eth",
      });
      const result = await getAddressHoverInfo(
        EOA,
        client,
        viemChains.gnosis.id,
      );
      expect(result).to.not.be.null;
      expect(result!.contents.join("\n")).to.not.include(
        "should-be-ignored.eth",
      );
    });
  });

  describe("Contracts", () => {
    it("renders a verified-contract card with name, compiler, license", async () => {
      const client = makeClient({
        code: "0x6080604052",
        balance: parseEther("12.345"),
      });

      const result = await getAddressHoverInfo(
        VERIFIED_CONTRACT,
        client,
        viemChains.mainnet.id,
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Contract**");
      expect(c).to.include("Name: **Verified**  *(verified)*");
      expect(c).to.include("0.8.20+commit.a1b79de6");
      expect(c).to.include("optimizer, 200 runs");
      expect(c).to.include("License: MIT");
      expect(c).to.include("Balance: 12.345 ETH");
      expect(c).to.include("Code size: 5 bytes");
    });

    it("renders an unverified contract card with the unverified tag", async () => {
      const client = makeClient({
        code: "0x6080604052",
        balance: 0n,
      });

      const result = await getAddressHoverInfo(
        UNVERIFIED_CONTRACT,
        client,
        viemChains.mainnet.id,
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Contract**");
      expect(c).to.include("Name: *(unverified)*");
      expect(c).to.not.include("Compiler:");
    });

    it("renders a Delegated EOA card for an EIP-7702 designator", async () => {
      // EIP-7702 code: `0xef0100` || 20-byte target address. The target
      // is `VERIFIED_CONTRACT` so the Sourcify mock resolves its name.
      const designator =
        `0xef0100${VERIFIED_CONTRACT.slice(2)}` as `0x${string}`;
      const client = makeClient({
        code: designator,
        balance: parseEther("0.5"),
        txCount: 3,
      });

      const result = await getAddressHoverInfo(
        EOA,
        client,
        viemChains.mainnet.id,
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Delegated EOA**");
      expect(c).to.include("EIP-7702");
      // Sourcify mock returns "Verified" for VERIFIED_CONTRACT.
      expect(c).to.include("Delegate:");
      expect(c).to.include("(Verified)");
      expect(c).to.include("Balance: 0.5 ETH");
      expect(c).to.include("Tx count: 3");
      // Must NOT be misclassified as a regular contract.
      expect(c).to.not.include("**Contract**");
      expect(c).to.not.include("Code size:");
    });

    it("detects EIP-1967 proxies and shows the implementation row", async () => {
      const client = makeClient({
        code: "0x6080604052",
        balance: 0n,
        implementation: IMPL_CONTRACT,
      });

      const result = await getAddressHoverInfo(
        PROXY_CONTRACT,
        client,
        viemChains.mainnet.id,
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Contract**");
      // Etherscan reports it as TransparentUpgradeableProxy, but the
      // implementation it returns is `0x...beef` -> resolved name MyImpl.
      expect(c).to.include("Proxy: → `0xbeef…beef` (MyImpl)");
      expect(c).to.include("[Implementation ↗]");
    });
  });

  describe("helper cache lookup (dispatcher)", () => {
    function makeStdModuleCache(): BindingsManager {
      const cache = new BindingsManager();
      cache.setBinding(
        "std",
        {
          commands: {},
          helpers: { ens: () => Promise.resolve("0x") },
          helperReturnTypes: { ens: "address" },
          helperArgDefs: {
            ens: [{ name: "name", type: "string", optional: false }],
          },
          helperDescriptions: { ens: "Resolve an ENS name to an address." },
        },
        BindingsSpace.MODULE,
      );
      return cache;
    }

    it("appends an address card when the helper result is cached", async () => {
      const cache = makeStdModuleCache();
      const resolved: Address = "0x000000000000000000000000000000000000aaaa";
      const chainId = viemChains.mainnet.id;
      cache.setBinding(
        `helper:${chainId}:ens:vitalik.eth`,
        resolved,
        BindingsSpace.CACHE,
      );

      const client = makeClient({ balance: 0n, txCount: 0, ensName: null });
      const result = await getHoverInfo(
        "set $x @ens(vitalik.eth)",
        { line: 1, col: 8 },
        { moduleCache: cache, client, chainId },
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("@ens");
      expect(c).to.include("**EOA**");
      expect(c).to.include(resolved);
    });

    it("does not append an address card when the helper has no cached value", async () => {
      const cache = makeStdModuleCache();
      const client = makeClient({});
      const result = await getHoverInfo(
        "set $x @ens(vitalik.eth)",
        { line: 1, col: 8 },
        { moduleCache: cache, client, chainId: viemChains.mainnet.id },
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("@ens");
      expect(c).to.not.include("**EOA**");
      expect(c).to.not.include("**Contract**");
    });
  });

  describe("variable hover (dispatcher)", () => {
    function makeStdModuleCache(): BindingsManager {
      const cache = new BindingsManager();
      cache.setBinding(
        "std",
        {
          commands: {
            set: () => Promise.resolve([]),
          },
          helpers: {},
          helperReturnTypes: {},
          helperArgDefs: {},
          helperDescriptions: {},
        },
        BindingsSpace.MODULE,
      );
      return cache;
    }

    it("appends the value when the variable is in scriptBindings", async () => {
      const cache = makeStdModuleCache();
      const scriptBindings = new BindingsManager();
      scriptBindings.setBinding("$answer", "42", BindingsSpace.USER);

      const result = await getHoverInfo(
        "set $answer 42\nset $other $answer",
        { line: 2, col: 12 },
        {
          moduleCache: cache,
          scriptBindings,
          chainId: viemChains.mainnet.id,
        },
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$answer");
      expect(c).to.include("*(variable)*");
      expect(c).to.include("= 42");
      expect(c).to.not.include("**EOA**");
      expect(c).to.not.include("**Contract**");
    });

    it("appends an address card when the variable resolves to an address", async () => {
      const cache = makeStdModuleCache();
      const scriptBindings = new BindingsManager();
      scriptBindings.setBinding("$dao", EOA, BindingsSpace.USER);

      const client = makeClient({
        balance: parseEther("3"),
        txCount: 7,
        ensName: "vitalik.eth",
      });

      const result = await getHoverInfo(
        `set $dao ${EOA}\ngrant $dao foo bar`,
        { line: 2, col: 7 },
        {
          moduleCache: cache,
          scriptBindings,
          client,
          chainId: viemChains.mainnet.id,
        },
      );

      expect(result).to.not.be.null;
      // Address card is now a separate section (own card with Monaco's
      // native divider above it) — at least 2 sections in the array.
      expect(result!.contents.length).to.be.greaterThan(1);
      const c = result!.contents.join("\n");
      expect(c).to.include("$dao");
      expect(c).to.include(`= ${EOA}`);
      expect(c).to.include("**EOA**");
      expect(c).to.include("Balance: 3 ETH");
    });

    it("falls back to the bare variable card when there is no scriptBindings entry", async () => {
      const cache = makeStdModuleCache();

      const result = await getHoverInfo(
        "grant $unknown role",
        { line: 1, col: 8 },
        {
          moduleCache: cache,
          scriptBindings: new BindingsManager(),
          chainId: viemChains.mainnet.id,
        },
      );

      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$unknown");
      expect(c).to.include("*(variable)*");
      expect(c).to.not.include("=");
    });
  });

  describe("caching", () => {
    it("does not re-call the client on a second hover for the same address", async () => {
      let codeCalls = 0;
      const client = {
        getCode: async () => {
          codeCalls++;
          return "0x" as `0x${string}`;
        },
        getBalance: async () => 0n,
        getTransactionCount: async () => 0,
        getEnsName: async () => null,
      } as unknown as PublicClient;

      await getAddressHoverInfo(EOA, client, viemChains.mainnet.id);
      await getAddressHoverInfo(EOA, client, viemChains.mainnet.id);

      expect(codeCalls).to.equal(1);
    });
  });
});
