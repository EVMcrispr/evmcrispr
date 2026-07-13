import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import { decodeFunctionData, maxUint256, parseAbi } from "viem";
import type Lending from "../../src";
import compoundV3 from "../../src/adapters/compound-v3";
import { COMPOUND_V3 } from "../../src/addresses";

const cometAbi = parseAbi([
  "function supply(address asset, uint256 amount)",
  "function supplyTo(address dst, address asset, uint256 amount)",
  "function withdraw(address asset, uint256 amount)",
  "function withdrawTo(address to, address asset, uint256 amount)",
]);

const CUSDC = COMPOUND_V3[1][0].comet;
const CWETH = COMPOUND_V3[1][1].comet;
const CUSDT = COMPOUND_V3[1][2].comet;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const LINK = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
const UNLISTED = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
const ME = "0x1234567890AbcdEF1234567890aBcdef12345678";
const OTHER = "0x64C007ba4Ab6184753Dc1e8E7263E8D06831C5f6";

// Base tokens per comet, mirroring the real mainnet deployments so the
// module-level base-token cache stays consistent across tests.
const BASES: Record<string, Address> = {
  [CUSDC.toLowerCase()]: USDC,
  [CWETH.toLowerCase()]: WETH,
  [CUSDT.toLowerCase()]: USDT,
};

type Read = { address: Address; functionName: string; args?: any[] };

/** Minimal Lending stand-in whose client answers canned reads. */
function stubModule(reads: (req: Read) => any = () => undefined): Lending {
  return {
    getChainId: async () => 1,
    getClient: async () => ({
      readContract: async (req: Read) => {
        if (req.functionName === "baseToken") {
          return BASES[req.address.toLowerCase()];
        }
        const result = reads(req);
        if (result === undefined) {
          throw new Error(`unexpected read: ${req.functionName}`);
        }
        return result;
      },
    }),
    context: { modules: [] },
  } as unknown as Lending;
}

const req = (overrides: Record<string, any>) => ({
  chainId: 1,
  token: USDC as Address,
  amount: 100n * 10n ** 6n,
  from: ME as Address,
  onBehalfOf: ME as Address,
  to: ME as Address,
  ...overrides,
});

async function expectRejection(
  method: () => Promise<any>,
  messagePart: string,
): Promise<void> {
  let error: Error | null = null;
  try {
    await method();
  } catch (err: any) {
    error = err;
  }
  expect(error, "Exception not thrown").not.to.be.null;
  expect(error!.message).to.include(messagePart);
}

function decode(action: any) {
  return decodeFunctionData({ abi: cometAbi, data: action.data });
}

describe("Lending > compound-v3 > adapter", () => {
  it("supplies the base asset to its own market with approval", async () => {
    const plan = await compoundV3.buildSupply(stubModule(), req({}));
    expect(plan.approvalTarget).to.eq(CUSDC);
    expect(plan.approvalAmount).to.eq(100n * 10n ** 6n);
    const { functionName, args } = decode(plan.actions[0]);
    expect(functionName).to.eq("supply");
    expect(args).to.eql([USDC, 100n * 10n ** 6n]);
  });

  it("routes a collateral token to the first market listing it", async () => {
    const module = stubModule((r) =>
      r.functionName === "getAssetInfoByAddress" &&
      r.address === CWETH &&
      r.args?.[0] === LINK
        ? { asset: LINK }
        : undefined,
    );
    const plan = await compoundV3.buildSupply(
      module,
      req({ token: LINK, amount: 5n * 10n ** 18n }),
    );
    expect(plan.approvalTarget).to.eq(CWETH);
    const { args } = decode(plan.actions[0]);
    expect(args).to.eql([LINK, 5n * 10n ** 18n]);
  });

  it("uses supplyTo when supplying on behalf of another account", async () => {
    const plan = await compoundV3.buildSupply(
      stubModule(),
      req({ onBehalfOf: OTHER }),
    );
    const { functionName, args } = decode(plan.actions[0]);
    expect(functionName).to.eq("supplyTo");
    expect(args).to.eql([OTHER, USDC, 100n * 10n ** 6n]);
  });

  it("rejects tokens listed on no market", async () => {
    await expectRejection(
      () => compoundV3.buildSupply(stubModule(), req({ token: UNLISTED })),
      "not listed on any CompoundV3 market on chain 1",
    );
  });

  it("borrows by withdrawing the base asset", async () => {
    const plan = await compoundV3.buildBorrow(stubModule(), req({}));
    expect(plan.approvalTarget).to.be.undefined;
    const { functionName, args } = decode(plan.actions[0]);
    expect(functionName).to.eq("withdraw");
    expect(args).to.eql([USDC, 100n * 10n ** 6n]);
  });

  it("refuses to borrow non-base tokens, naming the bases", async () => {
    await expectRejection(
      () => compoundV3.buildBorrow(stubModule(), req({ token: LINK })),
      "not the base token of a CompoundV3 market on chain 1 (bases: USDC, WETH, USDT)",
    );
  });

  it("refuses to borrow on behalf of another account", async () => {
    await expectRejection(
      () => compoundV3.buildBorrow(stubModule(), req({ onBehalfOf: OTHER })),
      "does not support borrowing on behalf",
    );
  });

  it("repays by supplying the base asset with an exact approval", async () => {
    const plan = await compoundV3.buildRepay(stubModule(), req({}));
    expect(plan.approvalTarget).to.eq(CUSDC);
    expect(plan.approvalAmount).to.eq(100n * 10n ** 6n);
    const { functionName } = decode(plan.actions[0]);
    expect(functionName).to.eq("supply");
  });

  it("repays max via uint256.max with a debt+0.1% approval buffer", async () => {
    const debt = 1000n * 10n ** 6n;
    const module = stubModule((r) =>
      r.functionName === "borrowBalanceOf" ? debt : undefined,
    );
    const plan = await compoundV3.buildRepay(module, req({ amount: "max" }));
    expect(plan.approvalAmount).to.eq(debt + debt / 1000n + 1n);
    const { args } = decode(plan.actions[0]);
    expect(args?.[1]).to.eq(maxUint256);
  });

  it("rejects repay max with zero debt and with --on-behalf-of", async () => {
    const module = stubModule((r) =>
      r.functionName === "borrowBalanceOf" ? 0n : undefined,
    );
    await expectRejection(
      () => compoundV3.buildRepay(module, req({ amount: "max" })),
      "no 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 debt to repay",
    );
    await expectRejection(
      () =>
        compoundV3.buildRepay(
          stubModule(),
          req({ amount: "max", onBehalfOf: OTHER }),
        ),
      "does not accept `max` together with --on-behalf-of",
    );
  });

  it("withdraws max as uint256.max, optionally to a recipient", async () => {
    const plan = await compoundV3.buildWithdraw(
      stubModule(),
      req({ amount: "max" }),
    );
    const { functionName, args } = decode(plan.actions[0]);
    expect(functionName).to.eq("withdraw");
    expect(args?.[1]).to.eq(maxUint256);

    const toPlan = await compoundV3.buildWithdraw(
      stubModule(),
      req({ to: OTHER }),
    );
    const decoded = decode(toPlan.actions[0]);
    expect(decoded.functionName).to.eq("withdrawTo");
    expect(decoded.args).to.eql([OTHER, USDC, 100n * 10n ** 6n]);
  });

  it("computes maxBorrow from discounted collateral minus debt", async () => {
    const FEED_WETH = "0x0000000000000000000000000000000000000101";
    const FEED_BASE = "0x0000000000000000000000000000000000000102";
    const module = stubModule((r) => {
      switch (r.functionName) {
        case "numAssets":
          return 1;
        case "baseScale":
          return 10n ** 6n;
        case "baseTokenPriceFeed":
          return FEED_BASE;
        case "borrowBalanceOf":
          return 1000n * 10n ** 6n;
        case "getAssetInfo":
          return {
            asset: WETH,
            priceFeed: FEED_WETH,
            scale: 10n ** 18n,
            borrowCollateralFactor: 825n * 10n ** 15n, // 82.5%
          };
        case "collateralBalanceOf":
          return 2n * 10n ** 18n;
        case "getPrice":
          return r.args?.[0] === FEED_WETH ? 2000n * 10n ** 8n : 10n ** 8n;
        default:
          return undefined;
      }
    });
    // 2 WETH * $2000 * 0.825 = $3300 capacity; minus $1000 debt = 2300 USDC.
    const max = await compoundV3.maxBorrow!(module, 1, ME, USDC);
    expect(max).to.eq(2300n * 10n ** 6n);
  });

  it("exposes no health factor or collateral toggle", () => {
    expect(compoundV3.healthFactor).to.be.undefined;
    expect(compoundV3.buildSetCollateral).to.be.undefined;
    expect(compoundV3.buildSetEmode).to.be.undefined;
  });
});
