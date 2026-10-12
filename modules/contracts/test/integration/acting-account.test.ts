import "../setup";
import { describe, expect, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, evml } from "@evmcrispr/test-utils/evml";
import { getContractAddress } from "viem";

const WHO = "0x000000000000000000000000000000000000bEEF";
const BYTECODE = "0x6080604052";

describe("Contracts > deploy and the acting account", () => {
  it("warns on contracts:deploy --from and points at switch --as", async () => {
    const { diagnostics } = await evml
      .script(`load contracts\ncontracts:deploy $a ${BYTECODE} --from ${WHO}`)
      .validate();
    const found = diagnostics.find((d) => d.code === "deprecated-option");
    expect(found?.severity).toBe("warning");
    expect(found?.message).toContain("switch --as <address> ( … )");
  });

  it("predicts a plain CREATE address from the account of switch --as", async () => {
    const client = getPublicClient();
    const interpreter = createInterpreter(
      `load contracts
set $addr 0
switch --as ${WHO} (
  contracts:deploy $addr ${BYTECODE}
)`,
      client,
    );
    // Nobody connected: the script is addressed to WHO.
    interpreter.evm.setConnectedAccount(undefined);
    const nonce = await client.getTransactionCount({ address: WHO });
    const actions = await interpreter.interpret();
    expect(actions).toEqual([{ data: BYTECODE, from: WHO }]);
    expect(interpreter.getBinding("$addr", BindingsSpace.USER)).toBe(
      getContractAddress({ from: WHO, nonce: BigInt(nonce) }),
    );
  });
});
