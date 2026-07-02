import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("wait", {
  describeName: "Std > commands > wait <duration>",
  cases: [
    {
      name: "should return a wait terminal action",
      script: "wait 60",
      expectedActions: [
        { type: "terminal", command: "wait", args: { seconds: 60 } },
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail with too many arguments",
      script: "wait 60 extra",
      error: "invalid number of arguments",
    },
    {
      name: "should fail with too few arguments",
      script: "wait",
      error: "invalid number of arguments",
    },
  ],
});
