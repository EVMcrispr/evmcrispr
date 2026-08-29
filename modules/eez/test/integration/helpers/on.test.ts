import "../../setup";
import { describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddressEqual } from "viem";
import { helpers } from "../../../src/_generated";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import { devnet, L1_ID, L2_ID, l1, l2 } from "../../devnet";

const DEAD = "0x000000000000000000000000000000000000dEaD";
/** Hardhat #3: funded on both chains, so balances are non-zero and differ. */
const FUNDED = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

describeHelper(
  "@eez:on",
  {
    module: "eez",
    skip: !devnet,
    preamble: "switch eezL1",
    cases: [
      {
        name: "reads a balance on the other chain",
        input: `@eez:on(${L2_ID} @balance(ETH ${FUNDED}))`,
        validate: async (result) => {
          const onL2 = await l2.getBalance({ address: FUNDED });
          expect(BigInt(result)).to.equal(onL2);
        },
      },
      {
        name: "evaluates module helpers against the other chain",
        input: `@eez:on(${L2_ID} @eez:proxy(${DEAD}))`,
        validate: async (result) => {
          const expected = await l2.readContract({
            address: EEZ_CHAINS[L2_ID].registry,
            abi: eezBaseAbi,
            functionName: "computeCrossChainProxyAddress",
            args: [DEAD, 0n],
          });
          expect(isAddressEqual(result, expected)).to.be.true;
        },
      },
      {
        name: "is a no-op on the current chain",
        input: `@eez:on(${L1_ID} 7)`,
        validate: (result) => {
          expect(BigInt(result)).to.equal(7n);
        },
      },
    ],
    errorCases: [
      {
        name: "refuses a chain nobody configured",
        input: "@eez:on(424242 1)",
        error: "not configured",
      },
    ],
    docCases: [
      {
        description:
          "From L1, read the connected account's balance on the rollup",
        code: "print @eez:on(eezL2 @balance(ETH @me))",
        preamble: "load eez\nswitch eezL1",
      },
    ],
  },
  helpers.on.argDefs,
);

describe.skipIf(!devnet)("Eez > helpers > @eez:on > restores the chain", () => {
  it("leaves the script on its own chain afterwards", async () => {
    const interpreter = createInterpreter(
      `load eez\nset $far @eez:on(${L2_ID} @balance(ETH ${FUNDED}))\nset $near @balance(ETH ${FUNDED})`,
      getPublicClient(),
      { chainId: L1_ID },
    );
    await interpreter.interpret();
    expect(await interpreter.evm.getChainId()).to.equal(L1_ID);
    const far = BigInt(
      String(interpreter.getBinding("$far", BindingsSpace.USER)),
    );
    const near = BigInt(
      String(interpreter.getBinding("$near", BindingsSpace.USER)),
    );
    expect(far).to.equal(await l2.getBalance({ address: FUNDED }));
    expect(near).to.equal(await l1.getBalance({ address: FUNDED }));
  }, 60_000);
});
