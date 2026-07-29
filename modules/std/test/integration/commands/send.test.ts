import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

const target = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const data =
  "0x1688f0b90000000000000000000000003e5c63644e683549055b9be8653de26e0b4cd36e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000001843dc407500000000000000000000000000000000000000000000000000000000000000164b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000662048b0a591d8f651e956519f6c5e3112626873000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const from = "0x8790B75CF2bd36A2502a3e48A24338D8288f2F15";

describeCommand("send", {
  describeName:
    "Std > commands > send [to] [--data <data>] [--value <value>] [opts...]",
  cases: [
    {
      name: "should return a call action with --data",
      script: `send ${target} --data ${data}`,
      expectedActions: [{ to: target, data }],
    },
    {
      name: "should return a value transfer when only --value is set",
      script: `send ${target} --value 1e18`,
      expectedActions: [{ to: target, value: 1000000000000000000n }],
    },
    {
      name: "should combine --data and --value",
      script: `send ${target} --data ${data} --value 1e18`,
      expectedActions: [{ to: target, data, value: 1000000000000000000n }],
    },
    {
      name: "should set --from",
      script: `send ${target} --data ${data} --from ${from}`,
      expectedActions: [{ to: target, data, from }],
    },
    {
      name: "should send a bare touch (no data, no value) to <to>",
      script: `send ${target}`,
      expectedActions: [{ to: target }],
    },
    {
      name: "should treat --data 0x as no calldata",
      script: `send ${target} --data 0x`,
      expectedActions: [{ to: target }],
    },
    {
      name: "should set --gas",
      script: `send ${target} --data ${data} --gas 100000`,
      expectedActions: [{ to: target, data, gas: 100000n }],
    },
    {
      name: "should set --nonce",
      script: `send ${target} --data ${data} --nonce 5`,
      expectedActions: [{ to: target, data, nonce: 5 }],
    },
    {
      name: "should set --max-fee-per-gas",
      script: `send ${target} --data ${data} --max-fee-per-gas 20e9`,
      expectedActions: [{ to: target, data, maxFeePerGas: 20000000000n }],
    },
    {
      name: "should set --max-priority-fee-per-gas",
      script: `send ${target} --data ${data} --max-priority-fee-per-gas 2e9`,
      expectedActions: [
        { to: target, data, maxPriorityFeePerGas: 2000000000n },
      ],
    },
    {
      name: "should combine multiple options",
      script: `send ${target} --data ${data} --value 1e18 --from ${from} --gas 100000 --nonce 3`,
      expectedActions: [
        {
          to: target,
          data,
          value: 1000000000000000000n,
          from,
          gas: 100000n,
          nonce: 3,
        },
      ],
    },
    {
      name: "should produce a deployment-style action when only --data is given (no `to`)",
      script: `send --data ${data}`,
      expectedActions: [{ data }],
    },
  ],
  docCases: [
    {
      description: "Send pre-encoded calldata",
      code: `set $data @abi.encodeCall("transfer(address,uint256)" 0x44fA8E6f47987339850636F88629646662444217 100e18)\nsend @token(DAI) --data $data`,
    },
    {
      description: "Native value transfer",
      code: `send 0x44fA8E6f47987339850636F88629646662444217 --value 1e18`,
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an invalid target address",
      script: `send false --data ${data}`,
      error: "[to] must be a valid address, got false",
    },
    {
      name: "should fail when receiving an invalid --value",
      script: `send ${target} --data ${data} --value foo`,
      error: "--value must be a number, got foo",
    },
    {
      name: "should fail when receiving an invalid --from address",
      script: `send ${target} --data ${data} --from 0xfail`,
      error: "--from must be a valid address, got 0xfail",
    },
    {
      name: "should fail when neither <to> nor --data is provided",
      script: `send --value 1e18`,
      error: "send requires <to> or --data",
    },
  ],
});
