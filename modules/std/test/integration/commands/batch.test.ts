import "../../setup";
import { isBatchedAction } from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";

const target = "0x44fA8E6f47987339850636F88629646662444217"; // DAI
const fnSig = "approve(address,uint256)";
const spender = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeCommand("batch", {
  describeName: "Std > commands > batch (...)",
  cases: [
    {
      name: "should return a BatchedAction containing all inner exec actions",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 1000e18
  exec ${target} ${fnSig} ${spender} 2000e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const batched = actions[0];
        expect(isBatchedAction(batched)).to.be.true;
        if (isBatchedAction(batched)) {
          expect(batched.actions).to.have.length(2);
          expect(batched.from).to.equal(TEST_ACCOUNT_ADDRESS);
        }
      },
    },
    {
      name: "should propagate --from on inner exec commands",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 500e18 --from ${spender}
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions[0].from).to.equal(spender);
        }
      },
    },
    {
      name: "should return empty actions for an empty batch",
      script: `batch (
)`,
      expectedActions: [],
    },
    {
      name: "should batch multiple different commands",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 100e18
  raw ${spender} 0x1234
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(2);
        }
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when batch contains a non-transaction action like switch",
      script: `batch (
  switch 1
)`,
      error: "non-transaction actions",
    },
  ],
});
