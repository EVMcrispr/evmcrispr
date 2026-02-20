import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

const target = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const data =
  "0x1688f0b90000000000000000000000003e5c63644e683549055b9be8653de26e0b4cd36e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000001843dc407500000000000000000000000000000000000000000000000000000000000000164b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000662048b0a591d8f651e956519f6c5e3112626873000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const from = "0x8790B75CF2bd36A2502a3e48A24338D8288f2F15";

describeCommand("raw", {
  describeName:
    "Std > commands > raw <target> <data> [value] [--from <sender>]",
  cases: [
    {
      name: "should return a correct raw action",
      script: `raw ${target} ${data}`,
      expectedActions: [{ to: target, data }],
    },
    {
      name: "should return a correct raw action when value is provided",
      script: `raw ${target} ${data} 1e18`,
      expectedActions: [{ to: target, data, value: 1000000000000000000n }],
    },
    {
      name: "should return a correct raw action when from address is provided",
      script: `raw ${target} ${data} --from ${from}`,
      expectedActions: [{ to: target, data, from }],
    },
    {
      name: "should return a correct raw action when value and from address are provided",
      script: `raw ${target} ${data} 1e18 --from ${from}`,
      expectedActions: [
        { to: target, data, value: 1000000000000000000n, from },
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an invalid target address",
      script: `raw false ${data}`,
      error: "<contractAddress> must be a valid address, got false",
    },
    {
      name: "should fail when receiving an invalid value",
      script: `raw ${target} ${data} foo`,
      error: "[value] must be a number, got foo",
    },
    {
      name: "should fail when receiving an invalid from address",
      script: `raw ${target} ${data} --from 0xfail`,
      error: "--from must be a valid address, got 0xfail",
    },
  ],
});
