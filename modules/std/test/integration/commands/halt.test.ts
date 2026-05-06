import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("halt", {
  describeName: "Std > commands > halt",
  docCases: [
    {
      description: "Stop script execution",
      code: `print "before"\nhalt`,
    },
  ],
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
