import "../../setup";
import { isBatchedAction } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

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
      name: "should batch a --create2 deployment (factory call has a target address)",
      script: `batch (
  deploy $addr 0x6080604052 --create2 0x0000000000000000000000000000000000000000000000000000000000000001
  exec ${target} ${fnSig} ${spender} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(2);
          expect(actions[0].actions[0].to).to.exist;
        }
      },
    },
    {
      name: "should allow batchable helpers like @me inside a batch",
      script: `batch (
  exec ${target} ${fnSig} @me 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(1);
        }
      },
    },
    {
      name: "should allow chain-state helpers at the beginning of the batch (before any action)",
      script: `batch (
  set $price @gas.price
  exec ${target} ${fnSig} ${spender} $price
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(1);
        }
      },
    },
    {
      name: "should allow variables set from non-batchable helpers before the batch",
      script: `set $price @gas.price
batch (
  exec ${target} ${fnSig} ${spender} $price
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(1);
        }
      },
    },
    {
      name: "should batch commands nested in transparent control-flow blocks",
      script: `batch (
  if true (
    exec ${target} ${fnSig} ${spender} 100e18
  )
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(1);
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
  send ${spender} --data 0x1234
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        if (isBatchedAction(actions[0])) {
          expect(actions[0].actions).to.have.length(2);
        }
      },
    },
  ],
  docCases: [
    {
      description: "Batch approve + transfer into one transaction",
      code: `batch (\n  exec @token(DAI) "approve(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18\n  exec @token(DAI) "transfer(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18\n)`,
    },
  ],
  errorCases: [
    {
      name: "should fail when batch contains a non-batchable command like switch",
      script: `batch (
  switch 1
)`,
      error: 'command "switch" cannot be used inside batch',
    },
    {
      name: "should fail when batch contains wait",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 100e18
  wait 60
)`,
      error: 'command "wait" cannot be used inside batch',
    },
    {
      name: "should fail when batch contains halt",
      script: `batch (
  halt
)`,
      error: 'command "halt" cannot be used inside batch',
    },
    {
      name: "should fail when batch contains load",
      script: `batch (
  load aragonos
)`,
      error: 'command "load" cannot be used inside batch',
    },
    {
      name: "should fail on nested batches",
      script: `batch (
  batch (
    exec ${target} ${fnSig} ${spender} 100e18
  )
)`,
      error: 'command "batch" cannot be used inside batch',
    },
    {
      name: "should fail on plain CREATE deployments inside a batch",
      script: `batch (
  deploy $addr 0x6080604052
)`,
      error: "plain CREATE deployments cannot be batched",
    },
    {
      name: "should fail on non-batchable commands nested in control-flow blocks",
      script: `batch (
  if true (
    switch 1
  )
)`,
      error: 'command "switch" cannot be used inside batch',
    },
    {
      name: "should fail when an inner action's --from differs from the batch sender",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 500e18 --from ${spender}
)`,
      error: "does not match batch sender",
    },
    {
      name: "should fail on chain-state-reading helpers after the batch has collected actions",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 100e18
  exec ${target} ${fnSig} ${spender} @gas.price
)`,
      error: "reads on-chain state at batch-build time",
    },
    {
      name: "should fail on inline calls after the batch has collected actions",
      script: `batch (
  exec ${target} ${fnSig} ${spender} 100e18
  exec ${target} ${fnSig} ${spender} ${target}::{decimals()(uint8)}
)`,
      error: "reads on-chain state at batch-build time",
    },
  ],
});
