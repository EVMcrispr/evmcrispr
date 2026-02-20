import "../../setup";
import { describeCommand, expect } from "@evmcrispr/test-utils";

describeCommand("halt", {
  describeName: "Std > commands > halt",
  cases: [
    {
      name: "should return a terminal action",
      script: "halt",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect(actions[0]).to.deep.equal({
          type: "terminal",
          command: "halt",
          args: {},
        });
      },
    },
  ],
});
