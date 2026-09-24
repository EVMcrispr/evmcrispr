import { describe, expect, it } from "bun:test";
import {
  encodeMultiSendCall,
  safeDeployment,
} from "@evmcrispr/module-safe/transactions";
import type { Module, TransactionAction } from "@evmcrispr/sdk";
import { Num } from "@evmcrispr/sdk";
import {
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  padHex,
  parseAbiParameters,
  size,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { accountSalt, unpackAccountCalls } from "../../src/twap/account";
import {
  cowAbi,
  cowTwap,
  decodeSchedule,
  integer,
  MAX_UINT32,
  paramsAbi,
  TIMESTAMP_FACTORY,
  TWAP_HANDLER,
  validateSchedule,
} from "../../src/twap/cow";
import { resolveTwap } from "../../src/twap/registry";
import type { TwapSchedule } from "../../src/twap/types";

const sellToken = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const buyToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const receiver = "0x1111111111111111111111111111111111111111";
const base: TwapSchedule = {
  sellToken,
  buyToken,
  receiver,
  partSellAmount: 400000n * 10n ** 18n,
  minPartLimit: 250n * 10n ** 18n,
  t0: 1700000000n,
  n: 30n,
  t: 86400n,
  span: 0n,
  appData: zeroHash,
};
const params = cowTwap.buildParams(base, padHex("0x1234", { size: 32 }));

describe("Swaps > TWAP encoding and validation", () => {
  it("matches the upstream 30-day DAI/WETH example with all ten ABI words", () => {
    // README example, extended with the deployed contract's appData field.
    const expected = concatHex(
      [sellToken, buyToken, receiver]
        .map((address) => padHex(address as `0x${string}`, { size: 32 }))
        .concat(
          [
            400000n * 10n ** 18n,
            250n * 10n ** 18n,
            1700000000n,
            30n,
            86400n,
            0n,
          ].map((n) => toHex(n, { size: 32 })),
          [zeroHash],
        ),
    );
    expect(params.handler).toBe(TWAP_HANDLER);
    expect(params.staticInput.toLowerCase()).toBe(expected.toLowerCase());
    expect(size(params.staticInput)).toBe(320);
    expect(decodeSchedule(params)).toEqual(base);
  });

  it("encodes the single-order hash preimage as a dynamic tuple", () => {
    const encoded = encodeAbiParameters(paramsAbi, [params]);
    const explicit = concatHex([
      encodeAbiParameters(
        parseAbiParameters("uint256,address,bytes32,uint256,uint256"),
        [32n, params.handler, params.salt, 96n, 320n],
      ),
      params.staticInput,
    ]);
    expect(encoded).toBe(explicit);
  });

  it("uses createWithContext only for a mining-time start and always dispatches", () => {
    const fixed = decodeFunctionData({
      abi: cowAbi,
      data: cowTwap.create(params).data!,
    });
    expect(fixed.functionName).toBe("create");
    expect(fixed.args).toEqual([params, true]);
    const dynamic = decodeFunctionData({
      abi: cowAbi,
      data: cowTwap.create(cowTwap.buildParams({ ...base, t0: 0n }, zeroHash))
        .data!,
    });
    expect(dynamic.functionName).toBe("createWithContext");
    expect(dynamic.args?.slice(1)).toEqual([TIMESTAMP_FACTORY, "0x", true]);
  });

  it.each([
    [{ n: 1n }, "--parts"],
    [{ n: MAX_UINT32 + 1n }, "--parts"],
    [{ t: 0n }, "--every"],
    [{ t: 31536001n }, "--every"],
    [{ span: 86401n }, "--window"],
    [{ t0: MAX_UINT32 }, "--start"],
    [{ partSellAmount: 0n }, "per-part"],
    [{ minPartLimit: 0n }, "per-part"],
    [{ buyToken: sellToken }, "different"],
    [{ sellToken: zeroAddress }, "ERC-20"],
    [{ buyToken: zeroAddress }, "ERC-20"],
    [{ t0: MAX_UINT32 - 1n }, "expiry"],
  ] as const)("rejects invalid schedule %#", (changes, message) => {
    expect(() => validateSchedule({ ...base, ...changes })).toThrow(message);
  });

  it("checks past starts and mining-time expiry against the current block", () => {
    expect(() => validateSchedule(base, base.t0 + 1n)).toThrow("past");
    expect(() =>
      validateSchedule({ ...base, t0: 0n }, MAX_UINT32 - 1n),
    ).toThrow("expiry");
    expect(() => validateSchedule({ ...base, span: base.t })).not.toThrow();
  });

  it("rejects fractional base units without truncation", () => {
    expect(integer(Num("10000000000000000001"), "amount")).toBe(
      10000000000000000001n,
    );
    expect(() => integer(Num(1n, 2n), "amount")).toThrow("integer");
    expect(() => integer(-1n, "amount")).toThrow("uint256");
    expect(() => integer(1n << 256n, "amount")).toThrow("uint256");
  });

  it("keeps provider support separate from spot CoW's intent policy", async () => {
    const module = {
      getChainId: async () => 100,
      context: { modules: [{ name: "sim", mode: "anvil" }] },
    } as unknown as Module;
    expect((await resolveTwap(module)).name).toBe("CoWSwap");
    await expect(resolveTwap(module, "UniswapV3")).rejects.toThrow(
      "does not support TWAP",
    );
    await expect(
      resolveTwap({ ...module, getChainId: async () => 10 } as Module),
    ).rejects.toThrow("not available");
    expect([1, 100, 137, 8453, 42161].every(cowTwap.supports)).toBe(true);
  });

  it("separates execution accounts by owner, chain and slot", () => {
    const salts = [
      accountSalt(1, receiver, 0),
      accountSalt(100, receiver, 0),
      accountSalt(1, receiver, 1),
      accountSalt(1, sellToken, 0),
    ];
    expect(new Set(salts).size).toBe(4);
  });

  it("unpacks call-only batches and refuses delegatecalls and malformed payloads", () => {
    const calls: TransactionAction[] = [
      { to: sellToken, data: "0x1234" as const },
      { to: buyToken, data: "0x" as const },
    ];
    expect(
      unpackAccountCalls(
        safeDeployment(1).multiSendCallOnly,
        encodeMultiSendCall(calls),
        1,
        1,
      ),
    ).toEqual(calls);
    expect(() => unpackAccountCalls(receiver, "0x", 1, 1)).toThrow(
      "delegatecall",
    );
    expect(() =>
      unpackAccountCalls(
        safeDeployment(1).multiSendCallOnly,
        encodeMultiSendCall([{ ...calls[0], operation: 1 }]),
        1,
        1,
      ),
    ).toThrow("Invalid MultiSend");
  });
});
