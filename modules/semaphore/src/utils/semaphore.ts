/**
 * Contract plumbing for the Semaphore v4 singleton: ABI, deployment
 * resolution (canonical address + config overrides, with a one-time
 * code probe per chain) and read wrappers.
 */
import { ErrorException, type Module, Num } from "@evmcrispr/sdk";
import { type Address, getAddress, parseAbi, parseAbiItem } from "viem";
import { SEMAPHORE_ADDRESS, SEMAPHORE_DEPLOY_BLOCK } from "../addresses";

export const SEMAPHORE_ABI = parseAbi([
  "function createGroup() returns (uint256)",
  "function createGroup(address admin) returns (uint256)",
  "function addMember(uint256 groupId, uint256 identityCommitment)",
  "function addMembers(uint256 groupId, uint256[] identityCommitments)",
  "function updateMember(uint256 groupId, uint256 identityCommitment, uint256 newIdentityCommitment, uint256[] merkleProofSiblings)",
  "function removeMember(uint256 groupId, uint256 identityCommitment, uint256[] merkleProofSiblings)",
  "function validateProof(uint256 groupId, (uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
  "function verifyProof(uint256 groupId, (uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
  "function getMerkleTreeRoot(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeSize(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeDepth(uint256 groupId) view returns (uint256)",
  "function getGroupAdmin(uint256 groupId) view returns (address)",
  "function groupCounter() view returns (uint256)",
]);

// Event params confirmed against ISemaphoreGroups.sol (v4): groupId is the
// only indexed member param, so per-group getLogs filters work.
export const MEMBER_ADDED = parseAbiItem(
  "event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)",
);
export const MEMBERS_ADDED = parseAbiItem(
  "event MembersAdded(uint256 indexed groupId, uint256 startIndex, uint256[] identityCommitments, uint256 merkleTreeRoot)",
);
export const MEMBER_UPDATED = parseAbiItem(
  "event MemberUpdated(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 newIdentityCommitment, uint256 merkleTreeRoot)",
);
export const MEMBER_REMOVED = parseAbiItem(
  "event MemberRemoved(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)",
);

export interface SemaphoreDeployment {
  chainId: number;
  address: Address;
  deployBlock: bigint;
}

const probed = new Set<string>();

/** Resolve the deployment for the current chain (config overrides first). */
export async function requireSemaphore(
  module: Module,
): Promise<SemaphoreDeployment> {
  const chainId = await module.getChainId();
  const override = module.getConfigBinding("address");
  const address = override ? getAddress(String(override)) : SEMAPHORE_ADDRESS;
  const blockOverride = module.getConfigBinding("deployBlock");
  const deployBlock =
    blockOverride !== undefined && blockOverride !== null
      ? Num(blockOverride).toBigInt()
      : SEMAPHORE_DEPLOY_BLOCK[chainId];
  if (deployBlock === undefined) {
    throw new ErrorException(
      `semaphore: no known deployment on chain ${chainId} — point at one with "set $semaphore:address <address>" and "set $semaphore:deployBlock <block>"`,
    );
  }
  const probeKey = `${chainId}:${address.toLowerCase()}`;
  if (!probed.has(probeKey)) {
    const client = await module.getClient();
    const code = await client.getCode({ address });
    if (!code || code === "0x") {
      throw new ErrorException(
        `semaphore: no Semaphore v4 deployment found at ${address} on chain ${chainId}`,
      );
    }
    probed.add(probeKey);
  }
  return { chainId, address, deployBlock };
}

export function parseGroupId(value: unknown, argName = "group"): bigint {
  try {
    const id = Num(value).toBigInt();
    if (id < 0n) throw new Error("negative");
    return id;
  } catch {
    throw new ErrorException(`<${argName}> must be a group id, got ${value}`);
  }
}

type ReadFn =
  | "getMerkleTreeRoot"
  | "getMerkleTreeSize"
  | "getMerkleTreeDepth"
  | "groupCounter";

export async function readSemaphore(
  module: Module,
  functionName: ReadFn,
  args: bigint[] = [],
): Promise<bigint> {
  const { address } = await requireSemaphore(module);
  const client = await module.getClient();
  return (await client.readContract({
    address,
    abi: SEMAPHORE_ABI,
    functionName,
    args: args as never,
  })) as bigint;
}
