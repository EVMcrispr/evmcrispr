import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeFunctionData, zeroAddress } from "viem";
import type Gelato from "..";
import { automateAbi } from "../abis";
import { AUTOMATE_ADDRESS } from "../addresses";
import { runnerCid } from "../runner/published";
import { RUNNER_SCHEMA, RUNNER_USER_ARG_NAMES } from "../runner/schema";
import { encodeUserArgs, parseEntries } from "../utils/entries";
import { functionUserArgsSchema } from "../utils/functionSchema";
import { encodeModuleData } from "../utils/moduleData";
import { requireAutomate } from "../utils/protocol";
import { parseScheduledScript } from "../utils/scheduled";
import {
  buildTrigger,
  payOpt,
  triggerOpts,
  validateTriggerOpts,
} from "../utils/trigger";
import { web3FunctionExec } from "../utils/web3FunctionTask";

/** An RPC URL that looks like it carries a credential. */
const KEYED_RPC = /[?&](api[_-]?key|key|token)=|\/[A-Za-z0-9_-]{24,}\/?$/i;

export default defineCommand<Gelato>({
  name: "schedule",
  description:
    "Create a Gelato Automate task that interprets an EVML script (a <<<EVML heredoc) off-chain on every trigger and executes the calls it produces: --every <duration>, --cron <expression>, --on <address> --event <signature>, --once, or every block when no trigger is given. The script runs in Gelato's sandbox through the EVML runner: @me is your wallet, @sender the dedicated msg.sender (@gelato:dedicatedMsgSender) every execution comes from; a script that produces no calls (or exits) skips that execution. With --function <cid> the task runs your own Web3 Function (deployed with npx w3f deploy) instead, with --args as its user args. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.",
  args: [
    {
      name: "source",
      type: "string",
      description:
        "EVML script to run on every trigger (use a <<<EVML heredoc); omit with --function",
      optional: true,
    },
  ],
  opts: [
    ...triggerOpts,
    {
      name: "rpc",
      type: "string",
      description:
        "JSON-RPC URL the script reads the chain through, outside the quota of Gelato's provider (stored on-chain with the task, so never a secret one)",
    },
    {
      name: "function",
      type: "string",
      description:
        "CID of a Web3 Function deployed with npx w3f deploy, to run instead of an EVML script",
    },
    {
      name: "args",
      type: "any",
      description:
        "Web3 Function user args as an entries array, e.g. [[vault 0x…] [threshold 100]]",
    },
    payOpt,
  ],
  async run(module, { source }, { opts }) {
    await requireAutomate(module);
    validateTriggerOpts(opts, { allowResolver: false, needsTrigger: false });
    const isFunction = opts.function !== undefined;
    if (isFunction && source !== undefined) {
      throw new ErrorException(
        "--function runs a Web3 Function of your own: give either it or an EVML script, not both",
      );
    }
    if (!isFunction && source === undefined) {
      throw new ErrorException(
        "expected an EVML script (a <<<EVML heredoc) or --function <cid>",
      );
    }
    if (opts.args !== undefined && !isFunction) {
      throw new ErrorException(
        "--args only applies to --function tasks: an EVML script embeds its values",
      );
    }
    if (opts.rpc !== undefined && isFunction) {
      throw new ErrorException(
        "--rpc only applies to EVML scripts: a Web3 Function reads through Gelato's provider",
      );
    }

    let cid: string;
    let args: `0x${string}`;
    const { execAddress, execData } = await web3FunctionExec(module);
    if (isFunction) {
      cid = String(opts.function);
      const schema = await functionUserArgsSchema(cid);
      const given =
        opts.args === undefined ? [] : parseEntries(opts.args, "--args");
      args = encodeUserArgs(schema, given).hex;
    } else {
      const script = String(source);
      parseScheduledScript(module, script);
      const rpcUrl = opts.rpc === undefined ? "" : String(opts.rpc);
      if (rpcUrl && KEYED_RPC.test(rpcUrl)) {
        module.context.log(
          ":warning: --rpc looks like it carries an API key; a task's user args are stored on-chain, in the clear",
        );
      }
      cid = runnerCid();
      if (!cid) {
        throw new ErrorException(
          "the EVML runner of this release has not been published to Gelato's function store yet: run `bun run publish-runner` in modules/gelato",
        );
      }
      const published = await functionUserArgsSchema(cid);
      const names = Object.keys(published);
      if (
        names.length !== RUNNER_USER_ARG_NAMES.length ||
        names.some((n, i) => n !== RUNNER_USER_ARG_NAMES[i])
      ) {
        throw new ErrorException(
          `the published EVML runner ${cid} takes user args (${names.join(", ")}) this release does not (${RUNNER_USER_ARG_NAMES.join(", ")}): republish it with \`bun run publish-runner\``,
        );
      }
      args = encodeUserArgs(RUNNER_SCHEMA.userArgs, [
        ["script", script],
        ["account", await module.getConnectedAccount()],
        ["sender", execAddress],
        ["rpcUrl", rpcUrl],
      ]).hex;
    }

    const moduleData = encodeModuleData({
      proxy: true,
      singleExec: Boolean(opts.once),
      web3Function: { cid, args },
      trigger: buildTrigger(opts, { defaultBlock: true }),
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
