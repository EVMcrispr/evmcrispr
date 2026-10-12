import "../setup";
import { describe, expect, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, evml } from "@evmcrispr/test-utils/evml";
import { getContractAddress } from "viem";
import { cloneInitCode } from "../../src/utils";
import { GNO } from "../fixtures";

const WHO = "0x000000000000000000000000000000000000bEEF";

describe("Proxies > clone and the acting account", () => {
  it("warns on proxies:clone --from and points at switch --as", async () => {
    const { diagnostics } = await evml
      .script(`load proxies\nproxies:clone $c ${GNO} --from ${WHO}`)
      .validate();
    const found = diagnostics.find((d) => d.code === "deprecated-option");
    expect(found?.severity).toBe("warning");
    expect(found?.message).toContain("switch --as <address> ( … )");
  });

  it("predicts a plain CREATE clone from the account of switch --as", async () => {
    const client = getPublicClient();
    const interpreter = createInterpreter(
      `load proxies
set $clone 0
switch --as ${WHO} (
  proxies:clone $clone ${GNO}
)`,
      client,
    );
    // Nobody connected: the script is addressed to WHO.
    interpreter.evm.setConnectedAccount(undefined);
    const nonce = await client.getTransactionCount({ address: WHO });
    const actions = await interpreter.interpret();
    expect(actions).toEqual([{ data: cloneInitCode(GNO), from: WHO }]);
    expect(interpreter.getBinding("$clone", BindingsSpace.USER)).toBe(
      getContractAddress({ from: WHO, nonce: BigInt(nonce) }),
    );
  });

  it("deprecated --from still names the deployer", async () => {
    const client = getPublicClient();
    const interpreter = createInterpreter(
      `load proxies\nproxies:clone $clone ${GNO} --from ${WHO}`,
      client,
    );
    const nonce = await client.getTransactionCount({ address: WHO });
    const actions = await interpreter.interpret();
    expect(actions).toEqual([{ data: cloneInitCode(GNO), from: WHO }]);
    expect(interpreter.getBinding("$clone", BindingsSpace.USER)).toBe(
      getContractAddress({ from: WHO, nonce: BigInt(nonce) }),
    );
  });
});
