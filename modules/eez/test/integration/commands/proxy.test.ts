import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, isAddressEqual, toHex } from "viem";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import { devnet, L1_ID } from "../../devnet";

const DEAD = "0x000000000000000000000000000000000000dEaD";
/** A target nobody has proxied: fresh per run, so the create action is emitted. */
const fresh = `0x${toHex(BigInt(Date.now()), { size: 20 }).slice(2)}`;

describeCommand("proxy", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "creates the proxy for a target nobody proxied yet",
      script: `eez:proxy ${fresh}`,
      validate: (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [action] = actions as any[];
        expect(isAddressEqual(action.to, EEZ_CHAINS[L1_ID].registry)).to.be
          .true;
        const decoded = decodeFunctionData({
          abi: eezBaseAbi,
          data: action.data,
        });
        expect(decoded.functionName).to.equal("createCrossChainProxy");
        expect(decoded.args?.[1]).to.equal(1n);
      },
    },
    {
      name: "honours an explicit rollup id",
      script: `eez:proxy ${fresh} --chain 7`,
      validate: (actions) => {
        const decoded = decodeFunctionData({
          abi: eezBaseAbi,
          data: (actions[0] as any).data,
        });
        expect(decoded.args?.[1]).to.equal(7n);
      },
    },
  ],
  errorCases: [
    {
      name: "refuses a proxy for the current chain itself",
      script: `eez:proxy ${DEAD} --chain 0`,
      error: "itself",
    },
  ],
  docCases: [
    {
      description:
        "Create the L1 proxy for a rollup contract, so L1 code can call it",
      code: "switch eezL1\neez:proxy 0x000000000000000000000000000000000000dEaD",
    },
  ],
});

describeCommand("proxy", {
  module: "eez",
  preamble: "load eez",
  describeName: "Eez > commands > proxy (non-EEZ chain)",
  errorCases: [
    {
      name: "explains which config vars make another chain usable",
      script: `eez:proxy ${DEAD}`,
      error: "is not a known EEZ chain",
    },
  ],
});
