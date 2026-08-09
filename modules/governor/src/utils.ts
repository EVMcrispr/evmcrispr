import type { Action, NodesInterpreters } from "@evmcrispr/sdk";
import { ErrorException, isTransactionAction, Num } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { encodeAbiParameters, keccak256, parseAbi, toHex } from "viem";

export const governorAbi = parseAbi([
  "function state(uint256 proposalId) view returns (uint8)",
  "function getProposalId(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (uint256)",
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (uint256)",
]);

export const timelockAbi = parseAbi([
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function getMinDelay() view returns (uint256)",
  "function isOperationPending(bytes32 id) view returns (bool)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
]);

/** Integer bigint from a Num or numeric string. */
export function toBigIntValue(value: unknown): bigint {
  const num = value instanceof Num ? value : Num(String(value));
  if (!num.isInteger()) {
    throw new ErrorException(`expected an integer, got ${value}`);
  }
  return num.toBigInt();
}

/** keccak256 hash of a proposal description, as used by queue/execute/cancel. */
export function hashDescription(description: string): Hex {
  return keccak256(toHex(description));
}

/**
 * Local replica of Governor.hashProposal: the default proposal id is
 * uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash))).
 */
export function hashProposalLocal(
  targets: Address[],
  values: bigint[],
  calldatas: Hex[],
  descriptionHash: Hex,
): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [
          { type: "address[]" },
          { type: "uint256[]" },
          { type: "bytes[]" },
          { type: "bytes32" },
        ],
        [targets, values, calldatas, descriptionHash],
      ),
    ),
  );
}

/**
 * Local replica of TimelockController.hashOperationBatch:
 * keccak256(abi.encode(targets, values, payloads, predecessor, salt)).
 */
export function hashOperationBatchLocal(
  targets: Address[],
  values: bigint[],
  payloads: Hex[],
  predecessor: Hex,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "bytes[]" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [targets, values, payloads, predecessor, salt],
    ),
  );
}

export interface BlockActions {
  targets: Address[];
  values: Num[];
  calldatas: Hex[];
  totalValue: bigint;
}

/**
 * Interpret a block of commands into the (targets, values, calldatas)
 * arrays a Governor proposal is made of, mirroring how std's `batch`
 * collects its actions.
 */
export async function collectBlockActions(
  commandName: string,
  block: any,
  interpreters: NodesInterpreters,
): Promise<BlockActions> {
  const blockActions = (await interpreters.interpretNode(block, {
    batchContext: { name: `governor:${commandName}`, hasActions: false },
  })) as Action[];

  if (blockActions.find((a) => !isTransactionAction(a))) {
    throw new ErrorException(
      `can't use non-transaction actions inside a governor:${commandName} block`,
    );
  }

  const targets: Address[] = [];
  const values: Num[] = [];
  const calldatas: Hex[] = [];
  let totalValue = 0n;

  for (const action of blockActions) {
    if (!isTransactionAction(action)) continue;
    if (!action.to) {
      throw new ErrorException(
        `can't use contract-creation actions inside a governor:${commandName} block`,
      );
    }
    targets.push(action.to);
    values.push(Num.fromBigInt(action.value ?? 0n));
    calldatas.push(action.data ?? "0x");
    totalValue += action.value ?? 0n;
  }

  if (targets.length === 0) {
    throw new ErrorException(
      `governor:${commandName} block must contain at least one action`,
    );
  }

  return { targets, values, calldatas, totalValue };
}
