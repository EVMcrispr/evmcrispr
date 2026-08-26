import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toFunctionSelector,
  toHex,
} from "viem";
import { automateAbi } from "../../../src/abis";
import { Module, TriggerType } from "../../../src/utils/moduleData";
import {
  AUTOMATE,
  CHECKER,
  NATIVE_FEE_TOKEN,
  VAULT,
  ZERO_ADDRESS,
} from "../../fixtures";

const targetAbi = parseAbi([
  "function rebalance()",
  "function harvest(address who)",
]);

function decodeCreateTask(action: any) {
  expect((action.to as string).toLowerCase()).to.eq(AUTOMATE.toLowerCase());
  const { functionName, args } = decodeFunctionData({
    abi: automateAbi,
    data: action.data,
  });
  expect(functionName).to.eq("createTask");
  const [execAddress, execData, moduleData, feeToken] = args as any;
  return { execAddress, execData, moduleData, feeToken };
}

function decodeTrigger(arg: `0x${string}`) {
  const [type, inner] = decodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes" }],
    arg,
  );
  return { type, inner };
}

describeCommand("automate", {
  module: "gelato",
  preamble: "load gelato",
  cases: [
    {
      name: "creates an interval task with full calldata",
      script: `gelato:automate ${VAULT} rebalance() --every 1h`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { execAddress, execData, moduleData, feeToken } =
          decodeCreateTask(actions[0]);
        expect(execAddress.toLowerCase()).to.eq(VAULT.toLowerCase());
        expect(execData).to.eq(
          encodeFunctionData({ abi: targetAbi, functionName: "rebalance" }),
        );
        expect(feeToken).to.eq(ZERO_ADDRESS);
        expect([...moduleData.modules]).to.eql([Module.PROXY, Module.TRIGGER]);
        const { type, inner } = decodeTrigger(moduleData.args[1]);
        expect(type).to.eq(TriggerType.TIME);
        expect(
          decodeAbiParameters(
            [{ type: "uint128" }, { type: "uint128" }],
            inner,
          ),
        ).to.eql([0n, 3_600_000n]);
      },
    },
    {
      name: "encodes call arguments from the signature",
      script: `gelato:automate ${VAULT} harvest(address) ${CHECKER} --cron "0 0 * * *"`,
      validate: (actions) => {
        const { execData, moduleData } = decodeCreateTask(actions[0]);
        expect(execData).to.eq(
          encodeFunctionData({
            abi: targetAbi,
            functionName: "harvest",
            args: [CHECKER],
          }),
        );
        const { type, inner } = decodeTrigger(moduleData.args[1]);
        expect(type).to.eq(TriggerType.CRON);
        expect(decodeAbiParameters([{ type: "string" }], inner)).to.eql([
          "0 0 * * *",
        ]);
      },
    },
    {
      name: "pins only the selector for resolver tasks",
      script: `gelato:automate ${VAULT} rebalance() --when ${CHECKER} --check "canRebalance()"`,
      validate: (actions) => {
        const { execData, moduleData } = decodeCreateTask(actions[0]);
        expect(execData).to.eq(toFunctionSelector("rebalance()"));
        expect([...moduleData.modules]).to.eql([Module.RESOLVER, Module.PROXY]);
        const [resolver, data] = decodeAbiParameters(
          [{ type: "address" }, { type: "bytes" }],
          moduleData.args[0],
        );
        expect(resolver.toLowerCase()).to.eq(CHECKER.toLowerCase());
        expect(data).to.eq(toFunctionSelector("canRebalance()"));
      },
    },
    {
      name: "builds an event trigger from the signature",
      script: `gelato:automate ${VAULT} rebalance() --on ${CHECKER} --event "Deposit(address,uint256)"`,
      validate: (actions) => {
        const { moduleData } = decodeCreateTask(actions[0]);
        const { type, inner } = decodeTrigger(moduleData.args[1]);
        expect(type).to.eq(TriggerType.EVENT);
        const [address, topics, confirmations] = decodeAbiParameters(
          [{ type: "address" }, { type: "bytes32[][]" }, { type: "uint256" }],
          inner,
        );
        expect(address.toLowerCase()).to.eq(CHECKER.toLowerCase());
        expect(topics).to.eql([[keccak256(toHex("Deposit(address,uint256)"))]]);
        expect(confirmations).to.eq(0n);
      },
    },
    {
      name: "combines --once and --pay",
      script: `gelato:automate ${VAULT} rebalance() --once true --pay ${NATIVE_FEE_TOKEN}`,
      validate: (actions) => {
        const { moduleData, feeToken } = decodeCreateTask(actions[0]);
        expect([...moduleData.modules]).to.eql([
          Module.PROXY,
          Module.SINGLE_EXEC,
        ]);
        expect(feeToken).to.eq(NATIVE_FEE_TOKEN);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a task without a trigger",
      script: `gelato:automate ${VAULT} rebalance()`,
      error: "needs a trigger",
    },
    {
      name: "rejects two triggers",
      script: `gelato:automate ${VAULT} rebalance() --every 1h --cron "0 0 * * *"`,
      error: "pick one trigger",
    },
    {
      name: "rejects --event without --on",
      script: `gelato:automate ${VAULT} rebalance() --event "Deposit(address,uint256)"`,
      error: "--on and --event go together",
    },
    {
      name: "rejects a malformed cron expression",
      script: `gelato:automate ${VAULT} rebalance() --cron "hourly"`,
      error: "5 fields",
    },
    {
      name: "rejects a non-positive interval",
      script: `gelato:automate ${VAULT} rebalance() --every 0`,
      error: "greater than zero",
    },
    {
      name: "rejects --args outside --function tasks",
      script: `gelato:automate ${VAULT} rebalance() --every 1h --args [[x 1]]`,
      error: "--args only applies",
    },
  ],
  docCases: [
    {
      description: "Rebalance a vault every hour, paid from your Gas Tank",
      code: `gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h`,
    },
    {
      description:
        "Let an on-chain checker decide when (and with what arguments) to harvest",
      code: `gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @me --when 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --check "shouldHarvest()"`,
    },
    {
      description: "React to deposits into a pool",
      code: `gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --on 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --event "Deposit(address,uint256)"`,
    },
  ],
});
