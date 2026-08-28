import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

const TASK_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

describeCommand("simulate-task", {
  module: "gelato",
  preamble: "load gelato",
  errorCases: [
    {
      name: "refuses to run outside a simulation",
      script: `gelato:simulate-task ${TASK_ID}`,
      error: "only runs inside a simulation",
    },
  ],
  docCases: [
    {
      description:
        "Create a one-shot task, run it as Gelato would, and see it cancel itself",
      code: `load sim
load lang

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate --once true (
    exec 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 approve(address,uint256) 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 0
  )
  gelato:simulate-task @gelato:lastTask()
  sim:expect @bool(@lang:len(@gelato:tasks()) == 0)
)`,
    },
    {
      description:
        "Schedule an EVML script and run it as the runner would: the calls it produces execute from the dedicated msg.sender",
      code: `load sim
load token

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:schedule --once true <<<EVML
load token
token:approve 1e6 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
EVML
  gelato:simulate-task @gelato:lastTask()
  sim:expect @bool(@token:allowance(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 @gelato:dedicatedMsgSender() 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 1e6)
)`,
    },
  ],
});
