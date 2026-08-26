import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  encodeFunctionData,
  parseAbiItem,
  zeroAddress,
} from "viem";
import type Gelato from "..";
import { automateAbi } from "../abis";
import { AUTOMATE_ADDRESS, ONE_BALANCE } from "../addresses";
import { Module } from "../utils/moduleData";
import { requireAutomate } from "../utils/protocol";

const TASK_CREATED = parseAbiItem(
  "event TaskCreated(address indexed taskCreator, address indexed execAddress, bytes execDataOrSelector, (uint8[] modules, bytes[] args) moduleData, address feeToken, bytes32 indexed taskId)",
);
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
/** How far back to look for the task's creation log (in blocks). */
const LOOKBACK = 2_000_000n;
const CHUNK = 20_000n;

export default defineCommand<Gelato>({
  name: "simulate-task",
  description:
    "Execute a Gelato Automate task the way Gelato's executors would — only inside a simulation: impersonates the Gelato executor and calls Automate.exec, so the resolver, the dedicated msg.sender proxy, single-exec cancellation and fee accounting all run for real against the fork. Resolver tasks are executed only when their checker says canExec; Web3 Function tasks cannot be simulated (the function runs off-chain).",
  batchable: false,
  args: [
    { name: "taskId", type: "bytes32", description: "Task id to execute" },
  ],
  async run(module, { taskId }, { interpreters }) {
    if (!interpreters.simulation) {
      throw new ErrorException(
        "gelato:simulate-task only runs inside a simulation (sim:fork) — on a live chain only Gelato's executors can execute tasks",
      );
    }
    await requireAutomate(module);
    const id = String(taskId) as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      throw new ErrorException(
        `<taskId> must be a bytes32 task id, got ${taskId}`,
      );
    }
    const client = await module.getClient();

    // Automate stores only the task-id hash; the payload lives in TaskCreated.
    const latest = await client.getBlockNumber();
    let created:
      | {
          taskCreator: Address;
          execAddress: Address;
          execDataOrSelector: Hex;
          moduleData: { modules: readonly number[]; args: readonly Hex[] };
          feeToken: Address;
        }
      | undefined;
    for (let to = latest; to > 0n && to > latest - LOOKBACK; to -= CHUNK) {
      const from = to - CHUNK + 1n > 0n ? to - CHUNK + 1n : 0n;
      const logs = await client.getLogs({
        address: AUTOMATE_ADDRESS,
        event: TASK_CREATED,
        args: { taskId: id },
        fromBlock: from,
        toBlock: to,
      });
      if (logs.length) {
        created = logs[logs.length - 1].args as typeof created;
        break;
      }
    }
    if (!created) {
      throw new ErrorException(
        `no TaskCreated log for ${id} in the last ${LOOKBACK} blocks of this chain`,
      );
    }

    const { modules, args } = created.moduleData;
    if (modules.includes(Module.WEB3_FUNCTION)) {
      throw new ErrorException(
        "Web3 Function tasks cannot be simulated on-chain: the function decides the calls off-chain",
      );
    }
    let execData = created.execDataOrSelector;
    const resolverIndex = modules.indexOf(Module.RESOLVER);
    if (resolverIndex >= 0) {
      const [resolver, data] = decodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        args[resolverIndex],
      );
      const { data: out } = await client.call({ to: resolver, data });
      if (!out) {
        throw new ErrorException(`the resolver ${resolver} returned no data`);
      }
      const [canExec, payload] = decodeAbiParameters(
        [{ type: "bool" }, { type: "bytes" }],
        out,
      );
      if (!canExec) {
        throw new ErrorException(
          `the resolver ${resolver} says the task is not executable now (canExec = false)`,
        );
      }
      execData = payload;
    }

    const gelato = await client.readContract({
      address: AUTOMATE_ADDRESS,
      abi: automateAbi,
      functionName: "gelato",
    });
    const moduleData = { modules: [...modules], args: [...args] };
    const data =
      created.feeToken === zeroAddress
        ? encodeFunctionData({
            abi: automateAbi,
            functionName: "exec1Balance",
            args: [
              created.taskCreator,
              created.execAddress,
              execData,
              moduleData,
              {
                sponsor: created.taskCreator,
                feeToken: NATIVE,
                oneBalanceChainId: BigInt(ONE_BALANCE.chainId),
                nativeToFeeTokenXRateNumerator: 1n,
                nativeToFeeTokenXRateDenominator: 1n,
                correlationId: `0x${"00".repeat(32)}`,
              },
              true,
            ],
          })
        : encodeFunctionData({
            abi: automateAbi,
            functionName: "exec",
            args: [
              created.taskCreator,
              created.execAddress,
              execData,
              moduleData,
              0n,
              created.feeToken,
              true,
            ],
          });
    return [
      {
        type: "rpc",
        method: "sim_addNativeBalance",
        params: [gelato, `0x${(10n ** 18n).toString(16)}`],
      },
      { to: AUTOMATE_ADDRESS, data, from: gelato },
    ];
  },
});
