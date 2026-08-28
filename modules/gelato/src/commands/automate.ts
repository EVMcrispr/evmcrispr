import type { BlockExpressionNode } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeSignatureCall,
} from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { encodeFunctionData, slice, zeroAddress } from "viem";
import type Gelato from "..";
import { automateAbi, opsProxyAbi } from "../abis";
import { AUTOMATE_ADDRESS } from "../addresses";
import { actionsToCalls } from "../runner/calls";
import { asExecutor, collectActions } from "../utils/executor";
import { encodeModuleData } from "../utils/moduleData";
import { requireAutomate } from "../utils/protocol";
import {
  buildTrigger,
  payOpt,
  triggerOpts,
  validateTriggerOpts,
} from "../utils/trigger";
import { dedicatedMsgSender } from "../utils/web3FunctionTask";

export default defineCommand<Gelato>({
  name: "automate",
  description:
    "Create a Gelato Automate task that executes the calls of a block on a trigger: --every <duration> (interval), --cron <expression>, --when <resolver> (an on-chain checker whose --check function returns whether and with what calldata to execute), --on <address> --event <signature> (event trigger), or --once (execute as soon as possible, a single time). The block is interpreted now and its calls are frozen into the task; several calls execute atomically through the dedicated msg.sender's batchExecuteCall. Inside the block @sender is your dedicated msg.sender (@gelato:dedicatedMsgSender), the address every execution comes from, so targets that restrict callers must allow it; @me stays your wallet. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.",
  createsBatchContext: true,
  args: [
    {
      name: "block",
      type: "block",
      description: "Commands whose calls the task executes",
    },
  ],
  opts: [
    ...triggerOpts,
    {
      name: "when",
      type: "address",
      description:
        "Resolver contract whose --check function decides when to execute (single-call blocks only)",
    },
    {
      name: "check",
      type: "string",
      description:
        'Resolver function returning (bool canExec, bytes execPayload); default "checker()"',
    },
    payOpt,
  ],
  async run(module, { block }, { interpreters, opts }) {
    await requireAutomate(module);
    validateTriggerOpts(opts, { allowResolver: true, needsTrigger: true });

    const executor = await dedicatedMsgSender(module);
    const calls = await asExecutor(module, executor, async () =>
      actionsToCalls(
        collectActions(
          await interpreters.interpretNode(block as BlockExpressionNode, {
            batchContext: { name: "automate", hasActions: false },
          }),
        ),
        executor,
      ),
    );
    if (calls.length === 0) {
      throw new ErrorException("the block produced no calls to automate");
    }

    let execAddress: Address;
    let execData: Hex;
    let resolver: { address: Address; data: Hex } | undefined;
    if (calls.length === 1 && calls[0].value === undefined) {
      // One plain call: Automate wraps it in the proxy's executeCall itself.
      execAddress = calls[0].to;
      execData = calls[0].data;
      if (opts.when !== undefined) {
        // A resolver supplies the full payload at execution time; Automate
        // pins only the selector the payload must start with.
        execData = slice(execData, 0, 4);
        resolver = {
          address: opts.when as Address,
          data: encodeSignatureCall(String(opts.check ?? "checker()"), []),
        };
      }
    } else {
      if (opts.when !== undefined) {
        throw new ErrorException(
          "--when resolvers decide one call: the block must produce a single call without value",
        );
      }
      // Several calls (or value): one atomic batchExecuteCall on the proxy,
      // which Automate passes through untouched when it is the exec target.
      execAddress = executor;
      execData = encodeFunctionData({
        abi: opsProxyAbi,
        functionName: "batchExecuteCall",
        args: [
          calls.map((c) => c.to),
          calls.map((c) => c.data),
          calls.map((c) => BigInt(c.value ?? "0")),
        ],
      });
    }

    // Automate requires the PROXY module on every task: executions always
    // come from the creator's dedicated msg.sender.
    const moduleData = encodeModuleData({
      resolver,
      proxy: true,
      singleExec: Boolean(opts.once),
      trigger: buildTrigger(opts, { defaultBlock: false }),
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
