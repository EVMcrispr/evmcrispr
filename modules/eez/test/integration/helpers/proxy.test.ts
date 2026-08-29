import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddressEqual } from "viem";
import { helpers } from "../../../src/_generated";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import { devnet, L1_ID, l1 } from "../../devnet";

const DEAD = "0x000000000000000000000000000000000000dEaD";

const onChain = (rollupId: bigint) =>
  l1.readContract({
    address: EEZ_CHAINS[L1_ID].registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [DEAD, rollupId],
  });

describeHelper(
  "@eez:proxy",
  {
    module: "eez",
    skip: !devnet,
    preamble: "switch eezL1",
    cases: [
      {
        name: "defaults to the rollup when called from L1",
        input: `@eez:proxy(${DEAD})`,
        validate: async (result) => {
          expect(isAddressEqual(result, await onChain(1n))).to.be.true;
        },
      },
      {
        name: "accepts an explicit rollup id",
        input: `@eez:proxy(${DEAD} rollup:5)`,
        validate: async (result) => {
          expect(isAddressEqual(result, await onChain(5n))).to.be.true;
        },
      },
    ],
    errorCases: [
      {
        name: "refuses the current chain's own rollup id",
        input: `@eez:proxy(${DEAD} rollup:0)`,
        error: "itself",
      },
    ],
    docCases: [
      {
        description:
          "Resolve where a rollup contract is reachable from L1, e.g. to pass it to another contract",
        code: "print @eez:proxy(0x000000000000000000000000000000000000dEaD)",
        preamble: `load eez\nswitch ${L1_ID}`,
      },
    ],
  },
  helpers.proxy.argDefs,
);
