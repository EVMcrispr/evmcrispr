import type { Address, Hex, PublicClient } from "viem";
import {
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  isAddressEqual,
  keccak256,
  parseAbi,
} from "viem";
import { ErrorException } from "../errors";
import type { BatchedAction, TransactionAction } from "../types";
import { SMART_DEPENDENCY_HASHES } from "./dependency-hashes";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  COMPOSABLE_STORAGE_ADDRESS,
  lowerSmartBatch,
} from "./smart";
import type { SmartBatchPlan } from "./smart-types";

export const SMART_EXECUTOR_CODE_HASH: Hex =
  "0x2a9adfdd05791154a19309d1b33c47cb72ec560018fd60d766b199ba8730a8ff";
export const SMART_STORAGE_CODE_HASH: Hex =
  "0xad487df7fc8555eb4258e9e4ee66d5cf20a3cb13f544945e8a4e4103fe795e44";
export const ERC7579_SINGLE_MODE = `0x${"00".repeat(32)}` as Hex;
export const ERC7579_BATCH_MODE = `0x01${"00".repeat(31)}` as Hex;
export const ERC7579_SMART_ABI = parseAbi([
  "function accountId() view returns (string)",
  "function isModuleInstalled(uint256 moduleTypeId,address module,bytes additionalContext) view returns (bool)",
  "function supportsExecutionMode(bytes32 mode) view returns (bool)",
  "function execute(bytes32 mode,bytes executionCalldata)",
]);

/** Fail closed before a signature. Addresses alone do not establish compatibility. */
export async function verifySmartDeployment(
  client: PublicClient,
  plan: SmartBatchPlan,
): Promise<void> {
  if ((await client.getChainId()) !== plan.chainId)
    throw new ErrorException("RPC chain does not match the smart batch");
  if (
    plan.version !== 1 ||
    !isAddressEqual(plan.executor, COMPOSABLE_EXECUTOR_ADDRESS) ||
    !isAddressEqual(plan.storage, COMPOSABLE_STORAGE_ADDRESS)
  )
    throw new ErrorException("unrecognized smart-batch executor profile");
  const checks: [Address, Hex | undefined][] = [
    [plan.executor, SMART_EXECUTOR_CODE_HASH],
  ];
  if (
    plan.steps.some(
      (step) =>
        step.kind === "composable" && step.execution.outputParams.length,
    )
  )
    checks.push([plan.storage, SMART_STORAGE_CODE_HASH]);
  checks.push(
    ...plan.dependencies.map((address): [Address, Hex] => {
      const hash = SMART_DEPENDENCY_HASHES[address.toLowerCase() as Address];
      if (!hash)
        throw new ErrorException(
          `unrecognized runtime-expression dependency ${address}`,
        );
      return [address, hash];
    }),
  );
  await Promise.all(
    checks.map(async ([address, hash]) => {
      const code = await client.getCode({ address });
      if (!code || code === "0x")
        throw new ErrorException(
          `smart-batch dependency ${address} is not deployed on chain ${plan.chainId}`,
        );
      if (hash && keccak256(code) !== hash)
        throw new ErrorException(
          `unrecognized smart-batch bytecode at ${address}`,
        );
    }),
  );
}

/** One wallet transaction, originating from the connected smart account. */
export async function prepareSmartAccountTransaction(
  client: PublicClient,
  plan: SmartBatchPlan,
): Promise<TransactionAction | BatchedAction> {
  if (plan.route !== "executor")
    throw new ErrorException(
      "Safe delegatecall plans require the Safe execution adapter",
    );
  await verifySmartDeployment(client, plan);
  const code = await client.getCode({ address: plan.account });
  if (!code || code === "0x")
    throw new ErrorException(
      "batch! requires an existing compatible smart account; account deployment and 7702 setup are not performed automatically",
    );
  const actions = lowerSmartBatch(plan);
  if (!actions.length)
    throw new ErrorException("cannot submit an empty smart batch");
  if (actions.some((action) => action.operation === 1))
    throw new ErrorException(
      "this smart-account route does not support inner delegatecalls",
    );
  let installed: boolean;
  let single: boolean;
  try {
    [installed, single] = await Promise.all([
      client.readContract({
        address: plan.account,
        abi: ERC7579_SMART_ABI,
        functionName: "isModuleInstalled",
        args: [2n, plan.executor, "0x"],
      }),
      client.readContract({
        address: plan.account,
        abi: ERC7579_SMART_ABI,
        functionName: "supportsExecutionMode",
        args: [ERC7579_SINGLE_MODE],
      }),
    ]);
  } catch {
    throw new ErrorException(
      "account does not expose a compatible ERC-7579 executor route; for a Safe use safe:propose! or safe:execute! with an owner wallet",
    );
  }
  if (!installed || !single)
    throw new ErrorException(
      "the composability executor must already be installed and support reverting single calls",
    );
  if (actions.length === 1)
    return {
      ...actions[0],
      operation: undefined,
      from: plan.account,
      chainId: plan.chainId,
    };
  const batch = await client.readContract({
    address: plan.account,
    abi: ERC7579_SMART_ABI,
    functionName: "supportsExecutionMode",
    args: [ERC7579_BATCH_MODE],
  });
  if (!batch)
    throw new ErrorException(
      "mixed smart batches require ERC-7579 reverting batch execution",
    );
  return {
    type: "batched",
    from: plan.account,
    chainId: plan.chainId,
    actions,
  };
}

/** Simulate the installed account's real ERC-7579 entry point without changing its implementation. */
export async function prepareSmartAccountSimulation(
  client: PublicClient,
  plan: SmartBatchPlan,
): Promise<TransactionAction> {
  const prepared = await prepareSmartAccountTransaction(client, plan);
  const actions = "type" in prepared ? prepared.actions : [prepared];
  const id = await client.readContract({
    address: plan.account,
    abi: ERC7579_SMART_ABI,
    functionName: "accountId",
  });
  const getter = id.toLowerCase().includes("nexus")
    ? "entryPoint"
    : id.toLowerCase().includes("kernel")
      ? "entrypoint"
      : undefined;
  if (!getter)
    throw new ErrorException(
      "this account requires a host smartBatch adapter to simulate its authenticated execution route",
    );
  const entryPoint = (await client.readContract({
    address: plan.account,
    abi: parseAbi([`function ${getter}() view returns (address)`]),
    functionName: getter,
  })) as Address;
  const code = await client.getCode({ address: entryPoint });
  if (!code || code === "0x")
    throw new ErrorException("the account's EntryPoint is not deployed");
  const mode = actions.length === 1 ? ERC7579_SINGLE_MODE : ERC7579_BATCH_MODE;
  const executionCalldata =
    actions.length === 1
      ? encodePacked(
          ["address", "uint256", "bytes"],
          [actions[0].to!, actions[0].value ?? 0n, actions[0].data ?? "0x"],
        )
      : encodeAbiParameters(
          [
            {
              type: "tuple[]",
              components: [
                { name: "target", type: "address" },
                { name: "value", type: "uint256" },
                { name: "callData", type: "bytes" },
              ],
            },
          ],
          [
            actions.map((a) => ({
              target: a.to!,
              value: a.value ?? 0n,
              callData: a.data ?? "0x",
            })),
          ],
        );
  return {
    to: plan.account,
    from: entryPoint,
    chainId: plan.chainId,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC7579_SMART_ABI,
      functionName: "execute",
      args: [mode, executionCalldata],
    }),
  };
}

/** ERC-4337 bundles may succeed on-chain while the account's operation reverts. */
export function checkSmartAccountReceipt(
  plan: SmartBatchPlan,
  entryPoint: Address,
  receipt: {
    logs?: readonly {
      address: string;
      topics: readonly string[];
      data: string;
    }[];
  },
): void {
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== entryPoint.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: parseAbi([
          "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
        ]),
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (
        event.args.sender.toLowerCase() === plan.account.toLowerCase() &&
        !event.args.success
      )
        throw new ErrorException(
          "the smart account's UserOperation reverted (the outer bundler transaction succeeded)",
        );
    } catch (error) {
      if (error instanceof ErrorException) throw error;
      // Other EntryPoint events have a different ABI.
    }
  }
}
