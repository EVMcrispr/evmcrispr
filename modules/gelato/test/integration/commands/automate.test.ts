import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
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
import { automateAbi, opsProxyAbi } from "../../../src/abis";
import { Module, TriggerType } from "../../../src/utils/moduleData";
import {
  AUTOMATE,
  CHECKER,
  NATIVE_FEE_TOKEN,
  VAULT,
  ZERO_ADDRESS,
} from "../../fixtures";
import { dedicatedMsgSenderOf } from "../../fixtures/proxy";

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
      name: "creates an interval task with the block's single call",
      script: `gelato:automate --every 1h (
  exec ${VAULT} rebalance()
)`,
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
      name: "resolves @sender inside the block to the dedicated msg.sender",
      script: `gelato:automate --cron "0 0 * * *" (
  exec ${VAULT} harvest(address) @sender
)`,
      validate: async (actions) => {
        const { execData, moduleData } = decodeCreateTask(actions[0]);
        expect(execData).to.eq(
          encodeFunctionData({
            abi: targetAbi,
            functionName: "harvest",
            args: [await dedicatedMsgSenderOf()],
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
      name: "keeps @me as the connected wallet inside the block",
      script: `gelato:automate --every 1h (
  exec ${VAULT} harvest(address) @me
)`,
      validate: (actions) => {
        const { execData } = decodeCreateTask(actions[0]);
        expect(execData).to.eq(
          encodeFunctionData({
            abi: targetAbi,
            functionName: "harvest",
            args: [TEST_ACCOUNT_ADDRESS],
          }),
        );
      },
    },
    {
      name: "batches several calls through the proxy's batchExecuteCall",
      script: `gelato:automate --every 1d (
  exec ${VAULT} rebalance()
  exec ${VAULT} harvest(address) ${CHECKER} --value 1e18
)`,
      validate: async (actions) => {
        const { execAddress, execData } = decodeCreateTask(actions[0]);
        expect(execAddress.toLowerCase()).to.eq(
          (await dedicatedMsgSenderOf()).toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: opsProxyAbi,
          data: execData,
        });
        expect(functionName).to.eq("batchExecuteCall");
        const [targets, datas, values] = args as any;
        expect(targets.map((t: string) => t.toLowerCase())).to.eql([
          VAULT.toLowerCase(),
          VAULT.toLowerCase(),
        ]);
        expect(datas[0]).to.eq(
          encodeFunctionData({ abi: targetAbi, functionName: "rebalance" }),
        );
        expect(values).to.eql([0n, 10n ** 18n]);
      },
    },
    {
      name: "pins only the selector for resolver tasks",
      script: `gelato:automate --when ${CHECKER} --check "canRebalance()" (
  exec ${VAULT} rebalance()
)`,
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
      script: `gelato:automate --on ${CHECKER} --event "Deposit(address,uint256)" (
  exec ${VAULT} rebalance()
)`,
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
      script: `gelato:automate --once true --pay ${NATIVE_FEE_TOKEN} (
  exec ${VAULT} rebalance()
)`,
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
      script: `gelato:automate (
  exec ${VAULT} rebalance()
)`,
      error: "needs a trigger",
    },
    {
      name: "rejects two triggers",
      script: `gelato:automate --every 1h --cron "0 0 * * *" (
  exec ${VAULT} rebalance()
)`,
      error: "pick one trigger",
    },
    {
      name: "rejects --event without --on",
      script: `gelato:automate --event "Deposit(address,uint256)" (
  exec ${VAULT} rebalance()
)`,
      error: "--on and --event go together",
    },
    {
      name: "rejects a malformed cron expression",
      script: `gelato:automate --cron "hourly" (
  exec ${VAULT} rebalance()
)`,
      error: "5 fields",
    },
    {
      name: "rejects a non-positive interval",
      script: `gelato:automate --every 0 (
  exec ${VAULT} rebalance()
)`,
      error: "greater than zero",
    },
    {
      name: "rejects an empty block",
      script: `gelato:automate --every 1h (
  set $x 1
)`,
      error: "produced no calls",
    },
    {
      name: "rejects a resolver over several calls",
      script: `gelato:automate --when ${CHECKER} (
  exec ${VAULT} rebalance()
  exec ${VAULT} rebalance()
)`,
      error: "single call",
    },
    {
      name: "rejects calls from another sender",
      script: `gelato:automate --every 1h (
  exec ${VAULT} rebalance() --from ${CHECKER}
)`,
      error: "cannot run from the dedicated msg.sender",
    },
  ],
  docCases: [
    {
      description: "Rebalance a vault every hour, paid from your Gas Tank",
      code: `gelato:automate --every 1h (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance()
)`,
    },
    {
      description:
        "Harvest and compound in one atomic execution every day; @sender is the dedicated msg.sender the calls come from",
      code: `gelato:automate --every 1d (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @sender
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 compound()
)`,
    },
    {
      description:
        "Let an on-chain checker decide when (and with what arguments) to harvest",
      code: `gelato:automate --when 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --check "shouldHarvest()" (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @sender
)`,
    },
    {
      description: "React to deposits into a pool",
      code: `gelato:automate --on 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --event "Deposit(address,uint256)" (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance()
)`,
    },
  ],
});
