import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript } from "@evmcrispr/core";
import {
  CORE_ADDRESS,
  encodeResolve,
  FETCHER_TYPE,
} from "@evmcrispr/sdk/onchain";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { createInterpreter, evml } from "@evmcrispr/test-utils/evml";
import { compileExpression } from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, isAddressEqual, parseAbi } from "viem";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import {
  deployValue,
  devnet,
  ensureFunded,
  L1_ID,
  L2_ID,
  l1,
  l1Wallet,
  l2,
  l2Wallet,
  testAccount,
} from "../../devnet";

/**
 * `@eez:on!`: a synchronous cross-rollup read inside an assertion. The
 * inner expression compiles against the other chain and is evaluated
 * there through the proxy, on the sending chain, of the Assertions core
 * deployed over there — a static call that the EEZ composer resolves
 * inline. That only happens inside a transaction, so an assert carrying
 * one is emitted as a transaction rather than an `eth_call`.
 */

/** Anvil #1: funded on both chains. */
const FUNDED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const valueAbi = parseAbi(["function setValue(uint256 v)"]);
const env = { module: "eez", chainId: L1_ID, transports: getTransports() };

const param = (operand: unknown) => {
  expect((operand as { kind: string }).kind).to.equal("call");
  return (
    operand as { param: { fetcherType: number; paramData: `0x${string}` } }
  ).param;
};

describe.skipIf(!devnet)("@eez:on! (on-chain face)", () => {
  /** The L1 proxy of the Assertions core deployed on L2. */
  let coreProxy: `0x${string}`;

  /** Create the proxy of `target` (an address on rollup `rollupId`) on
   *  `chainId`, unless it exists. Returns the proxy address. */
  const ensureProxy = async (
    chainId: number,
    target: `0x${string}`,
    rollupId: bigint,
  ) => {
    const { registry } = EEZ_CHAINS[chainId];
    const [client, wallet] =
      chainId === L1_ID ? [l1, l1Wallet] : [l2, l2Wallet];
    const proxy = await client.readContract({
      address: registry,
      abi: eezBaseAbi,
      functionName: "computeCrossChainProxyAddress",
      args: [target, rollupId],
    });
    const code = await client.getCode({ address: proxy });
    if (code && code !== "0x") return proxy;
    const hash = await wallet.writeContract({
      address: registry,
      abi: eezBaseAbi,
      functionName: "createCrossChainProxy",
      args: [target, rollupId],
    });
    await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    return proxy;
  };

  beforeAll(async () => {
    await ensureFunded();
    // The read goes out through the L2 core's proxy on L1, and is resolved
    // on L2 as a static call from the L1 core's proxy there. Static
    // resolution cannot deploy a proxy, so both must exist up front.
    coreProxy = await ensureProxy(L1_ID, CORE_ADDRESS, 1n);
    await ensureProxy(L2_ID, CORE_ADDRESS, 0n);
  }, 180_000);

  it("reads the other chain through the proxy of the Assertions core there", async () => {
    const { operand, ctx } = await compileExpression(
      `@eez:on!(eezL2 @balance!(ETH ${FUNDED}))`,
      env,
    );
    const inner = await compileExpression(`@balance!(ETH ${FUNDED})`, {
      ...env,
      chainId: L2_ID,
    });

    const p = param(operand);
    expect((operand as { cat: string }).cat).to.equal("Uint");
    expect(p.fetcherType).to.equal(FETCHER_TYPE.StaticCall);
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      p.paramData,
    );
    expect(isAddressEqual(target, coreProxy)).to.be.true;
    expect(data).to.equal(encodeResolve(param(inner.operand) as never));
    // Only a transaction reaches the composer.
    expect(ctx.hints?.transact).to.be.true;
  });

  it("passes a constant through untouched", async () => {
    const { operand, ctx } = await compileExpression("@eez:on!(eezL2 7)", env);
    expect(operand.kind).to.equal("const");
    expect(String((operand as { value: unknown }).value)).to.equal("7");
    expect(ctx.hints?.transact).to.not.be.true;
  });

  it("is the plain face on the current chain", async () => {
    const wrapped = await compileExpression(
      `@eez:on!(eezL1 @balance!(ETH ${FUNDED}))`,
      env,
    );
    const plain = await compileExpression(`@balance!(ETH ${FUNDED})`, env);
    expect(wrapped.operand).to.eql(plain.operand);
    expect(wrapped.ctx.hints?.transact).to.not.be.true;
  });

  it("turns a standalone assert into a transaction", async () => {
    const [crossChain] = await createInterpreter(
      `load eez\nassert @eez:on!(eezL2 @balance!(ETH ${FUNDED})) > 0`,
      undefined as never,
      { chainId: L1_ID },
    ).interpret();
    expect((crossChain as { readOnly?: boolean }).readOnly).to.be.false;

    const [local] = await createInterpreter(
      `load eez\nassert @balance!(ETH ${FUNDED}) > 0`,
      undefined as never,
      { chainId: L1_ID },
    ).interpret();
    expect((local as { readOnly?: boolean }).readOnly).to.be.true;
  });

  it("asserts a rollup value from L1 end to end", async () => {
    const value = await deployValue(l2Wallet, l2);
    const expected = BigInt(Date.now());
    const hash = await l2Wallet.writeContract({
      address: value,
      abi: valueAbi,
      functionName: "setValue",
      args: [expected],
    });
    await l2.waitForTransactionReceipt({ hash, timeout: 60_000 });

    const result = await executeScript(
      `load eez\nassert @eez:on!(eezL2 ${value}::{value()(uint256)}) == ${expected}`,
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      { prepareChains: false },
    );
    expect(result.executed).to.have.lengthOf(1);
    expect((result.executed[0].result as { status: string }).status).to.equal(
      "success",
    );
  }, 180_000);
});
