import "../../setup";
import { BindingsSpace, encodeAction, Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand, describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { hashDescription, hashProposalLocal } from "../../../src/utils";
import { GNO, SOME_ADDRESS } from "../../fixtures";

// A non-governor address: the getProposalId/hashProposal reads revert and
// the id falls back to the local hashProposal replica.
const GOVERNOR = "0x2222222222222222222222222222222222222222";
const DESCRIPTION = "Fund the grants program";

const transferData = encodeAction(GNO, "transfer(address,uint256)", [
  SOME_ADDRESS,
  Num(100000000000000000000n),
]).data!;
const expectedId = hashProposalLocal(
  [GNO],
  [0n],
  [transferData],
  hashDescription(DESCRIPTION),
);

describeCommand("propose", {
  describeName:
    "Governor > commands > propose $id <governor> <description> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should bind the proposal id to the optional variable",
      script: `governor:propose $proposalId ${GOVERNOR} "${DESCRIPTION}" (
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18
)`,
      validate: (result, interpreter) => {
        const bound = interpreter.getBinding("$proposalId", BindingsSpace.USER);
        expect(bound).to.be.instanceOf(Num);
        expect((bound as Num).toBigInt()).to.equal(expectedId);
        // the propose action itself is unchanged by the binding
        expect(result).to.eql([
          encodeAction(
            GOVERNOR,
            "propose(address[],uint256[],bytes[],string)",
            [[GNO], [Num(0n)], [transferData], DESCRIPTION],
          ),
        ]);
      },
    },
  ],
});

describeHelper(
  "@governor.proposalId",
  {
    describeName:
      "Governor > helpers > @governor.proposalId(governor targets values calldatas description)",
    module: "governor",
    cases: [
      {
        name: "should derive the proposal id from the proposal arrays",
        input: `@governor.proposalId(${GOVERNOR} [${GNO}] [0] [${transferData}] "${DESCRIPTION}")`,
        expected: expectedId,
      },
    ],
    errorCases: [
      {
        name: "should fail when targets are not addresses",
        input: `@governor.proposalId(${GOVERNOR} ["nope"] [0] [${transferData}] "${DESCRIPTION}")`,
        error: "must contain addresses",
      },
    ],
    sampleArgs: [GOVERNOR, `[${GNO}]`, "[0]", `[${transferData}]`, '"desc"'],
  },
  helpers["governor.proposalId"].argDefs,
);
