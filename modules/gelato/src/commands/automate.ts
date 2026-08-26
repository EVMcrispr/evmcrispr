import {
  defineCommand,
  ErrorException,
  encodeSignatureCall,
  Num,
} from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  encodeFunctionData,
  keccak256,
  slice,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import type Gelato from "..";
import { automateAbi, opsProxyFactoryAbi } from "../abis";
import { AUTOMATE_ADDRESS, OPS_PROXY_FACTORY_ADDRESS } from "../addresses";
import { parseDuration } from "../utils/duration";
import { encodeUserArgs, parseEntries } from "../utils/entries";
import { functionUserArgsSchema } from "../utils/functionSchema";
import { encodeModuleData, type Trigger } from "../utils/moduleData";
import { requireAutomate } from "../utils/protocol";

/** OpsProxy.batchExecuteCall — what a Web3 Function task executes through the dedicated msg.sender. */
const BATCH_EXECUTE_CALL = toFunctionSelector(
  "batchExecuteCall(address[],bytes[],uint256[])",
);

function eventTopic(event: string): Hex {
  if (/^0x[0-9a-fA-F]{64}$/.test(event)) return event as Hex;
  const sig = event.replace(/\s+/g, "");
  if (!/^[A-Za-z_]\w*\([\w[\],]*\)$/.test(sig)) {
    throw new ErrorException(
      `--event must be an event signature like "Transfer(address,address,uint256)" or a topic hash, got ${event}`,
    );
  }
  return keccak256(toHex(sig));
}

export default defineCommand<Gelato>({
  name: "automate",
  description:
    "Create a Gelato Automate task that calls a contract function on a trigger: --every <duration> (interval), --cron <expression>, --when <resolver> (an on-chain checker whose --check function returns whether and with what calldata to execute), --on <address> --event <signature> (event trigger), or --once (execute as soon as possible, a single time). With --function <cid> the task runs a published Web3 Function instead and executes the calls it returns. Every execution is sent from your dedicated msg.sender (@gelato:dedicatedMsgSender), so targets that restrict callers must allow that address. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.",
  args: [
    {
      name: "target",
      type: "address",
      description: "Contract to call (omit with --function)",
      optional: true,
    },
    {
      name: "signature",
      type: "write-abi",
      description: "Function to call, e.g. rebalance() (omit with --function)",
      optional: true,
    },
    {
      name: "params",
      type: "any",
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  opts: [
    {
      name: "every",
      type: "number",
      description: "Run on an interval, e.g. 5m, 1h, 1d",
    },
    {
      name: "start",
      type: "number",
      description: "Unix timestamp (seconds) of the first --every execution",
    },
    {
      name: "cron",
      type: "string",
      description: 'Run on a cron schedule, e.g. "0 0 * * *"',
    },
    {
      name: "when",
      type: "address",
      description:
        "Resolver contract whose --check function decides when to execute",
    },
    {
      name: "check",
      type: "string",
      description:
        'Resolver function returning (bool canExec, bytes execPayload); default "checker()"',
    },
    {
      name: "on",
      type: "address",
      description: "Contract whose --event triggers the task",
    },
    {
      name: "event",
      type: "string",
      description:
        'Event signature, e.g. "Deposit(address,uint256)", or a topic hash',
    },
    {
      name: "once",
      type: "bool",
      description: "Execute a single time, then the task cancels itself",
    },
    {
      name: "function",
      type: "string",
      description:
        "CID of a published Web3 Function (see gelato:publish-function) to run instead of a fixed call",
    },
    {
      name: "args",
      type: "any",
      description:
        "Web3 Function user args as an entries array, e.g. [[vault 0x…] [threshold 100]]",
    },
    {
      name: "pay",
      type: "address",
      description:
        "Fee token the target contract pays executions with (sync fee) instead of your Gas Tank",
    },
  ],
  async run(module, { target, signature, params }, { opts }) {
    await requireAutomate(module);

    const triggers = ["every", "cron", "when", "on"].filter(
      (o) => opts[o] !== undefined,
    );
    if (triggers.length > 1) {
      throw new ErrorException(
        `pick one trigger, got --${triggers.join(" and --")}`,
      );
    }
    if (opts.check !== undefined && opts.when === undefined) {
      throw new ErrorException("--check needs --when <resolver>");
    }
    if ((opts.event === undefined) !== (opts.on === undefined)) {
      throw new ErrorException("--on and --event go together");
    }
    if (opts.start !== undefined && opts.every === undefined) {
      throw new ErrorException("--start only applies to --every tasks");
    }
    const isFunction = opts.function !== undefined;
    if (!isFunction && triggers.length === 0 && !opts.once) {
      throw new ErrorException(
        "a task needs a trigger: --every, --cron, --when, --on/--event or --once",
      );
    }
    if (opts.args !== undefined && !isFunction) {
      throw new ErrorException("--args only applies to --function tasks");
    }
    if (isFunction && (target !== undefined || signature !== undefined)) {
      throw new ErrorException(
        "--function tasks take no target call — the Web3 Function returns what to execute",
      );
    }
    if (!isFunction && (target === undefined || signature === undefined)) {
      throw new ErrorException(
        "expected <target> <signature> [params…] (or --function <cid>)",
      );
    }

    // Automate's TIME trigger takes milliseconds (automate-sdk convention).
    let trigger: Trigger | undefined;
    if (opts.every !== undefined) {
      const seconds = parseDuration(opts.every, "--every");
      const start =
        opts.start === undefined ? 0n : Num(opts.start).toBigInt() * 1000n;
      trigger = { type: "time", start, interval: seconds * 1000n };
    } else if (opts.cron !== undefined) {
      const expression = String(opts.cron).trim();
      if (expression.split(/\s+/).length !== 5) {
        throw new ErrorException(
          `--cron expects 5 fields like "0 0 * * *", got "${expression}"`,
        );
      }
      trigger = { type: "cron", expression };
    } else if (opts.on !== undefined) {
      trigger = {
        type: "event",
        address: opts.on as Address,
        topics: [[eventTopic(String(opts.event))]],
        confirmations: 0n,
      };
    } else if (isFunction && !opts.once) {
      // Gelato's own default for functions without a schedule: every block.
      trigger = { type: "block" };
    }

    let execAddress: Address;
    let execData: Hex;
    let resolver: { address: Address; data: Hex } | undefined;
    let web3Function: { cid: string; args: Hex } | undefined;

    if (isFunction) {
      const cid = String(opts.function);
      const schema = await functionUserArgsSchema(module, cid);
      const given =
        opts.args === undefined ? [] : parseEntries(opts.args, "--args");
      web3Function = { cid, args: encodeUserArgs(schema, given).hex };
      const client = await module.getClient();
      const account = await module.getConnectedAccount();
      execAddress = (await client.readContract({
        address: OPS_PROXY_FACTORY_ADDRESS,
        abi: opsProxyFactoryAbi,
        functionName: "determineProxyAddress",
        args: [account],
      })) as Address;
      execData = BATCH_EXECUTE_CALL;
    } else {
      execAddress = target as Address;
      const calldata = encodeSignatureCall(signature as string, params);
      if (opts.when !== undefined) {
        // A resolver supplies the full payload at execution time; Automate
        // pins only the selector the payload must start with.
        execData = slice(calldata, 0, 4);
        resolver = {
          address: opts.when as Address,
          data: encodeSignatureCall(String(opts.check ?? "checker()"), []),
        };
      } else {
        execData = calldata;
      }
    }

    // Automate now requires the PROXY module on every task: executions
    // always come from the creator's dedicated msg.sender.
    const moduleData = encodeModuleData({
      resolver,
      proxy: true,
      singleExec: Boolean(opts.once),
      web3Function,
      trigger,
    });
    const data = encodeFunctionData({
      abi: automateAbi,
      functionName: "createTask",
      args: [
        execAddress,
        execData,
        moduleData,
        (opts.pay as Address | undefined) ?? zeroAddress,
      ],
    });
    return [{ to: AUTOMATE_ADDRESS, data }];
  },
});
