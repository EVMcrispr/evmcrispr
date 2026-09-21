import { describe, expect, it, spyOn } from "bun:test";
import { evml } from "@evmcrispr/core";
import {
  custom,
  encodeFunctionData,
  hashTypedData,
  parseAbi,
  type TypedDataDefinition,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(toHex(1n, { size: 32 }));
const transport = custom({
  request: async () => {
    throw new Error("RPC forbidden");
  },
});
describe("generic local-first helpers", () => {
  it("decodes a supplied ABI without RPC, ENS, or HTTP", async () => {
    const abi = parseAbi(["function transfer(address,uint256)"]);
    const data = encodeFunctionData({
      abi,
      functionName: "transfer",
      args: [account.address, 123n],
    });
    const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("HTTP forbidden"),
    );
    const logs: string[] = [];
    try {
      await evml
        .with({ transports: { 1: transport }, onLog: (s) => logs.push(s) })
        .script(
          `set $decoded @abi.decodeCall(${account.address} ${data} ${JSON.stringify(JSON.stringify(abi))})\nprint $decoded`,
        )
        .execute(undefined);
      expect(logs.join("\n")).toContain("transfer(address,uint256)");
      expect(logs.join("\n")).toContain("123");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("prints accurate hashes before signing even when EIP712Domain is implicit", async () => {
    const typed: TypedDataDefinition = {
      domain: { name: "Test", chainId: 1 },
      types: { Test: [{ name: "value", type: "uint256" }] },
      primaryType: "Test",
      message: { value: "9007199254740993" },
    };
    const logs: string[] = [];
    await evml
      .with({
        account: account.address,
        transports: { 1: transport },
        onLog: (s) => logs.push(s),
      })
      .script(`sign $sig --typed ${JSON.stringify(JSON.stringify(typed))}`)
      .execute(undefined, {
        handlers: {
          wallet: async (action) => {
            expect(logs.join("\n")).toContain(hashTypedData(typed));
            expect(JSON.parse(action.params[1])).toEqual(typed);
            return account.signTypedData(typed);
          },
        },
      });
  });
});
