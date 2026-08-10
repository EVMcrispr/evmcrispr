import "../../setup";
import {
  describeParity,
  installConstantMock,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @governor, against constant-returning mocks.
 *
 * No governor or timelock on either fork answers these, so the alternative is
 * no coverage. As with @safe, what this proves is narrow and worth stating:
 * each helper issues the same call on both faces and decodes the bytes the
 * same way. It proves nothing about a governor's behaviour, since the mock
 * has none.
 *
 * The @proposalState case is the interesting one — it is the module's
 * documented divergence, where the plain face returns the state's NAME and
 * the `!` face the raw uint8. Pinned so that `@proposalState(...) == "Active"`
 * and `@proposalState!(...) == 4` cannot quietly become interchangeable, or
 * quietly stop being equivalent.
 */

/** getMinDelay() -> uint256 */
const TIMELOCK = "0x0000000000000000000000000000000000060a01";
/** state(uint256) -> uint8; 4 is Succeeded in OZ's ProposalState. */
const GOV = "0x0000000000000000000000000000000000060a02";
/** A governor exposing getProposalId, and a timelock exposing getTimestamp. */
const GOV2 = "0x0000000000000000000000000000000000060a03";
const TL2 = "0x0000000000000000000000000000000000060a04";
const TARGET = "0x1111111111111111111111111111111111111111";
const OP_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000bb";

describeParity("@governor", {
  module: "governor",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      TIMELOCK,
      encodeAbiParameters([{ type: "uint256" }], [172800n]),
    );
    await installConstantMock(
      client,
      GOV,
      encodeAbiParameters([{ type: "uint8" }], [4]),
    );
    await installSelectorMock(client, GOV2, [
      {
        selector: toFunctionSelector(
          "function getProposalId(address[],uint256[],bytes[],bytes32) view returns (uint256)",
        ),
        data: encodeAbiParameters([{ type: "uint256" }], [123456789n]),
      },
    ]);
    // The ! face resolves the state through nested conds over the three
    // isOperation* predicates, so all of them have to answer consistently:
    // scheduled, not ready, not done — i.e. Waiting.
    await installSelectorMock(client, TL2, [
      {
        selector: toFunctionSelector(
          "function getTimestamp(bytes32) view returns (uint256)",
        ),
        data: encodeAbiParameters([{ type: "uint256" }], [4102444800n]),
      },
      {
        selector: toFunctionSelector(
          "function isOperationPending(bytes32) view returns (bool)",
        ),
        data: encodeAbiParameters([{ type: "bool" }], [true]),
      },
      {
        selector: toFunctionSelector(
          "function isOperationReady(bytes32) view returns (bool)",
        ),
        data: encodeAbiParameters([{ type: "bool" }], [false]),
      },
      {
        selector: toFunctionSelector(
          "function isOperationDone(bytes32) view returns (bool)",
        ),
        data: encodeAbiParameters([{ type: "bool" }], [false]),
      },
    ]);
  },
  cases: [
    {
      name: "timelockMinDelay reads getMinDelay on both faces",
      run: `@governor:timelockMinDelay(${TIMELOCK})`,
      compile: `@governor:timelockMinDelay!(${TIMELOCK})`,
    },
    {
      // The governor exposes getProposalId, so both faces take that branch
      // rather than the hashProposal fallback.
      name: "proposalId derives the same id on both faces",
      run: `@governor:proposalId(${GOV2} [${TARGET}] [0] ["0x"] "hello")`,
      compile: `@governor:proposalId!(${GOV2} [${TARGET}] [0] ["0x"] "hello")`,
    },
    {
      // Same shape as proposalState: the plain face names the state, the !
      // face returns the numeric OperationState.
      name: "diverges: timelockOperationState is a name off-chain, a number on-chain",
      run: `@governor:timelockOperationState(${TL2} ${OP_ID})`,
      compile: `@governor:timelockOperationState!(${TL2} ${OP_ID})`,
      helper: "timelockOperationState",
      diverges: {
        reason:
          "the plain face returns the state's name, the ! face its number",
      },
    },
    {
      name: "diverges: proposalState is a name off-chain and a number on-chain",
      run: `@governor:proposalState(${GOV} 1)`,
      compile: `@governor:proposalState!(${GOV} 1)`,
      helper: "proposalState",
      diverges: {
        reason: "the plain face returns the enum's name, the ! face its uint8",
      },
    },
  ],
});
