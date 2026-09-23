import { describe, expect, it } from "bun:test";
import { createEvml, Interpreter } from "@evmcrispr/core";
import type { SmartBatchAction } from "@evmcrispr/sdk";
import {
  custom,
  encodeAbiParameters,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import Bridges from "../../src";

const account = "0x1111111111111111111111111111111111111111";
const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const unknown = "0x2222222222222222222222222222222222222222";
const tag = createEvml().use(Bridges);
const compile = async (body: string) =>
  (
    await new Interpreter(tag.registry, {
      account,
      chainId: 1,
      transports: {
        1: custom({
          request: async ({ method, params }) => {
            if (method === "eth_chainId") return "0x1";
            if (method === "eth_call") {
              const data = (params as any)[0].data as string;
              if (data.startsWith(toFunctionSelector("oftVersion()")))
                return encodeAbiParameters(
                  parseAbiParameters("bytes4,uint64"),
                  ["0x02e49c2c", 1n],
                );
              if (data.startsWith(toFunctionSelector("token()")))
                return encodeAbiParameters(parseAbiParameters("address"), [
                  unknown,
                ]);
              if (data.startsWith(toFunctionSelector("approvalRequired()")))
                return encodeAbiParameters(parseAbiParameters("bool"), [true]);
            }
            throw Error(`Unexpected off-chain quote/read: ${method}`);
          },
        }),
      },
    }).interpret(
      `load bridges\nbatch !(\nexec ${unknown} "seed() returns (uint256,address)" -> [$amount $recipient]\n${body}\n)`,
    )
  )[0] as SmartBatchAction;
describe("smart bridge source calls", () => {
  for (const venue of ["CCTPv2", "NativeBridge", "CCIP", "LayerZero"])
    it(`${venue} preserves runtime inputs and resolves fees in order`, async () => {
      const asset =
        venue === "NativeBridge"
          ? "0x0000000000000000000000000000000000000000"
          : venue === "LayerZero"
            ? unknown
            : token;
      const action = await compile(
        `bridges:bridge $amount ${asset} to 10 --receiver $recipient --using ${venue} --no-approve true --max-fee 100`,
      );
      expect(action.plan.steps.length).toBeGreaterThan(1);
      expect(action.plan.steps.at(-1)?.kind).toBe("composable");
      expect(structuredClone(action)).toEqual(action);
    });
  it("keeps external quote inputs concrete", async () => {
    await expect(
      compile(`bridges:bridge $amount ${token} to 10 --using Across`),
    ).rejects.toThrow("build-time external quote");
  });
  it("rejects unsupported native lane recipient changes", async () => {
    await expect(
      compile(
        `bridges:bridge $amount 0x0000000000000000000000000000000000000000 to 42161 --receiver $recipient --using NativeBridge`,
      ),
    ).rejects.toThrow();
  });
});
