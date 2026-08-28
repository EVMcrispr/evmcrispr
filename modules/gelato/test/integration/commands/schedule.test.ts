import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  decodeAbiParameters,
  decodeFunctionData,
  toFunctionSelector,
} from "viem";
import { automateAbi } from "../../../src/abis";
import { Module, TriggerType } from "../../../src/utils/moduleData";
import { AUTOMATE, VAULT } from "../../fixtures";
import { TEST_CID, TEST_RUNNER_CID } from "../../fixtures/msw-handlers";
import { dedicatedMsgSenderOf } from "../../fixtures/proxy";

const USDC = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";
const SCRIPT = `load token
token:approve 1e6 ${USDC} for ${VAULT}`;
const RUNNER_ARGS = [
  { type: "string" },
  { type: "string" },
  { type: "string" },
  { type: "string" },
] as const;
const HEREDOC = `<<<EVML
${SCRIPT}
EVML`;

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

function decodeWeb3Function(arg: `0x${string}`) {
  const [cid, userArgs] = decodeAbiParameters(
    [{ type: "string" }, { type: "bytes" }],
    arg,
  );
  return { cid, userArgs };
}

function decodeTrigger(arg: `0x${string}`) {
  const [type] = decodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes" }],
    arg,
  );
  return type;
}

describeCommand("schedule", {
  module: "gelato",
  preamble: "load gelato",
  cases: [
    {
      name: "creates a runner task carrying the script, the wallet, the executor and no RPC",
      script: `gelato:schedule --every 1h ${HEREDOC}`,
      validate: async (actions) => {
        expect(actions).to.have.length(1);
        const { execAddress, execData, moduleData } = decodeCreateTask(
          actions[0],
        );
        const executor = await dedicatedMsgSenderOf();
        expect(execAddress.toLowerCase()).to.eq(executor.toLowerCase());
        expect(execData).to.eq(
          toFunctionSelector("batchExecuteCall(address[],bytes[],uint256[])"),
        );
        expect([...moduleData.modules]).to.eql([
          Module.PROXY,
          Module.WEB3_FUNCTION,
          Module.TRIGGER,
        ]);
        const { cid, userArgs } = decodeWeb3Function(moduleData.args[1]);
        expect(cid).to.eq(TEST_RUNNER_CID);
        expect(decodeAbiParameters(RUNNER_ARGS, userArgs)).to.eql([
          SCRIPT,
          TEST_ACCOUNT_ADDRESS,
          executor,
          "",
        ]);
        expect(decodeTrigger(moduleData.args[2])).to.eq(TriggerType.TIME);
      },
    },
    {
      name: "runs every block when no trigger is given",
      script: `gelato:schedule ${HEREDOC}`,
      validate: (actions) => {
        const { moduleData } = decodeCreateTask(actions[0]);
        expect(decodeTrigger(moduleData.args[2])).to.eq(TriggerType.BLOCK);
      },
    },
    {
      name: "makes a one-shot task with --once",
      script: `gelato:schedule --once true ${HEREDOC}`,
      validate: (actions) => {
        const { moduleData } = decodeCreateTask(actions[0]);
        expect([...moduleData.modules]).to.eql([
          Module.PROXY,
          Module.SINGLE_EXEC,
          Module.WEB3_FUNCTION,
        ]);
      },
    },
    {
      name: "stores the RPC URL the script reads through",
      script: `gelato:schedule --cron "0 0 * * *" --rpc https://rpc.example.org/v1/abcdefghijklmnopqrstuvwxyz ${HEREDOC}`,
      validate: (actions) => {
        const { moduleData } = decodeCreateTask(actions[0]);
        const { userArgs } = decodeWeb3Function(moduleData.args[1]);
        const [, , , rpcUrl] = decodeAbiParameters(RUNNER_ARGS, userArgs);
        expect(rpcUrl).to.eq(
          "https://rpc.example.org/v1/abcdefghijklmnopqrstuvwxyz",
        );
      },
    },
    {
      name: "runs a user Web3 Function with typed user args",
      script: `gelato:schedule --function ${TEST_CID} --args [[vault ${VAULT}] [threshold 5]] --every 5m`,
      validate: (actions) => {
        const { moduleData } = decodeCreateTask(actions[0]);
        const { cid, userArgs } = decodeWeb3Function(moduleData.args[1]);
        expect(cid).to.eq(TEST_CID);
        expect(
          decodeAbiParameters(
            [{ type: "string" }, { type: "uint256" }],
            userArgs,
          ),
        ).to.eql([VAULT, 5n]);
      },
    },
  ],
  errorCases: [
    {
      name: "needs a script or a function",
      script: "gelato:schedule --every 1h",
      error: "expected an EVML script",
    },
    {
      name: "refuses a script and a function together",
      script: `gelato:schedule --function ${TEST_CID} --every 1h ${HEREDOC}`,
      error: "not both",
    },
    {
      name: "keeps --args for functions",
      script: `gelato:schedule --every 1h --args [[x 1]] ${HEREDOC}`,
      error: "--args only applies",
    },
    {
      name: "keeps --rpc for scripts",
      script: `gelato:schedule --function ${TEST_CID} --rpc https://rpc.example.org --every 1h`,
      error: "--rpc only applies",
    },
    {
      name: "refuses modules the runner does not ship",
      script: `gelato:schedule --every 1h <<<EVML
load sim
EVML`,
      error: "load sim is not available",
    },
    {
      name: "refuses a script that does not parse",
      script: `gelato:schedule --every 1h <<<EVML
exec (
EVML`,
      error: "does not parse",
    },
    {
      name: "rejects two triggers",
      script: `gelato:schedule --every 1h --cron "0 0 * * *" ${HEREDOC}`,
      error: "pick one trigger",
    },
    {
      name: "rejects a malformed cron expression",
      script: `gelato:schedule --cron "hourly" ${HEREDOC}`,
      error: "5 fields",
    },
  ],
  docCases: [
    {
      description:
        "Every midnight, re-approve the vault for the whole USDC balance the dedicated msg.sender holds by then",
      code: `gelato:schedule --cron "0 0 * * *" <<<EVML
load token
token:approve @token:balance(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 @me) 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 for 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
EVML`,
    },
    {
      description:
        "Run a Web3 Function of your own (deployed with npx w3f deploy) every five minutes",
      code: `gelato:schedule --function QmTestWeb3FunctionCidEvmcrisprGelatoModule0000000 --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64] [threshold 5]] --every 5m`,
    },
  ],
});
