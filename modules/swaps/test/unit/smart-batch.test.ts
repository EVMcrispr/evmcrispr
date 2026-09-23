import { describe, expect, it } from "bun:test";
import { createEvml, Interpreter } from "@evmcrispr/core";
import type { SmartBatchAction } from "@evmcrispr/sdk";
import {
  custom,
  encodeAbiParameters,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import Swaps from "../../src";

const account = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const tag = createEvml().use(Swaps);
const compile = async (body: string, chainId = 1) =>
  (
    await new Interpreter(tag.registry, {
      account,
      chainId,
      transports: {
        [chainId]: custom({
          request: async ({ method, params }) => {
            if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
            if (method === "eth_getCode") return "0x6000";
            if (
              method === "eth_call" &&
              (params as any)?.[0]?.data?.startsWith(
                toFunctionSelector("getPair(address,address)"),
              )
            )
              return encodeAbiParameters(parseAbiParameters("address"), [
                other,
              ]);
            throw new Error(`Unexpected quote/RPC: ${method}`);
          },
        }),
      },
    }).interpret(`load swaps\nbatch !(\n${body}\n)`)
  )[0] as SmartBatchAction;
describe("smart swap builders", () => {
  for (const venue of [
    "UniswapV2",
    "SushiSwap",
    "Honeyswap",
    "UniswapV3",
    "UniswapV4",
  ]) {
    for (const command of ["swap", "swap-to"])
      it(`${venue} ${command} compiles runtime amounts and recipients with explicit bounds`, async () => {
        const bound = command === "swap" ? "min" : "max";
        const action = await compile(
          `exec ${token} "f() returns (uint256,address)" -> [$amount $recipient]\nswaps:${command} $amount ${token} ${command === "swap" ? "to" : "from"} ${other} --${bound} $amount --to $recipient --using ${venue} --deadline 9999999999 --fee 3000 --no-approve true`,
          venue === "Honeyswap" ? 100 : 1,
        );
        expect(action.plan.steps.length).toBeGreaterThan(1);
        expect(structuredClone(action)).toEqual(action);
        expect(action.plan.steps.at(-1)?.kind).toBe("composable");
      });
  }
  it("requires explicit bounds for runtime amounts", async () => {
    await expect(
      compile(
        `swaps:swap @balance!(${token} @sender) ${token} to ${other} --using UniswapV3 --fee 3000 --deadline 9999999999`,
      ),
    ).rejects.toThrow("explicit --min");
  });
  it("rejects runtime external-quote inputs and intent orders", async () => {
    await expect(
      compile(
        `swaps:swap @balance!(${token} @sender) ${token} to ${other} --using Delora --min 1 --deadline 9999999999`,
      ),
    ).rejects.toThrow("build-time");
    await expect(
      compile(
        `swaps:swap @balance!(${token} @sender) ${token} to ${other} --using Balancer --min 1 --deadline 9999999999`,
      ),
    ).rejects.toThrow("build-time");
    await expect(
      compile(`swaps:swap 1 ${token} to ${other} --using CoWSwap --min 1`),
    ).rejects.toThrow("cannot run inside");
  });
});
