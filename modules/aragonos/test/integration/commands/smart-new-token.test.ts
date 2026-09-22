import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("new-token", {
  module: "aragonos",
  preamble: "load aragonos",
  cases: [
    {
      name: "preserves factory-call creation with typed controller and metadata",
      script: `aragonos:new-token $token "Runtime Token" RT ${TEST_ACCOUNT_ADDRESS} 18 true`,
    },
  ],
});
