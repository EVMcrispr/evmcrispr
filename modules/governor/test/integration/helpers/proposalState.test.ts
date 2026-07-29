import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@governor:proposalState",
  {
    describeName:
      "Governor > helpers > @governor:proposalState(governor, proposalId)",
    module: "governor",
  },
  helpers.proposalState.argDefs,
);
