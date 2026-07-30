/**
 * Group member-set reconstruction from Semaphore events.
 *
 * The contract stores only the LeanIMT nodes, so the ordered leaf array is
 * replayed from MemberAdded / MembersAdded / MemberUpdated / MemberRemoved
 * logs (removal sets the leaf to 0 and keeps the tree size — zk-kit
 * InternalLeanIMT._remove delegates to _update(oldLeaf, 0, siblings)).
 * After every replay the reconstructed lean root is asserted against the
 * on-chain root, so a reconstruction bug can never produce unprovable or
 * wrong-tree proofs silently.
 *
 * Scans are chunked (public RPCs cap wide ranges) and cached incrementally
 * per (chain, group) on the module instance for the session.
 */

import { type Hash2, leanRoot } from "@evmcrispr/module-zk";
import { ErrorException, type Module } from "@evmcrispr/sdk";
import type { AbiEvent } from "viem";
import type Semaphore from "..";
import {
  MEMBER_ADDED,
  MEMBER_REMOVED,
  MEMBER_UPDATED,
  MEMBERS_ADDED,
  readSemaphore,
  requireSemaphore,
} from "./semaphore";

/** Block window per eth_getLogs request (public RPCs cap wide ranges). */
const LOG_CHUNK = 5_000_000n;

const MEMBER_EVENTS: AbiEvent[] = [
  MEMBER_ADDED,
  MEMBERS_ADDED,
  MEMBER_UPDATED,
  MEMBER_REMOVED,
];

interface MemberLog {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
}

async function getMemberLogs(
  module: Module,
  groupId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<MemberLog[]> {
  const { address } = await requireSemaphore(module);
  const client = await module.getClient();
  const logs: MemberLog[] = [];
  // Providers cap getLogs ranges anywhere from 5M blocks down to 1000
  // (fork upstreams especially) — shrink the window on range errors.
  let chunk = LOG_CHUNK;
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + chunk - 1n > toBlock ? toBlock : from + chunk - 1n;
    let results: unknown[][];
    try {
      // `args` filters only work with a single event, so query one by one.
      results = await Promise.all(
        MEMBER_EVENTS.map((event) =>
          client.getLogs({
            address,
            event,
            args: { groupId },
            fromBlock: from,
            toBlock: to,
          }),
        ),
      );
    } catch (err) {
      if (chunk > 1000n && /range|limit|10000|1000/i.test(String(err))) {
        chunk = chunk / 10n < 1000n ? 1000n : chunk / 10n;
        continue;
      }
      throw err;
    }
    logs.push(
      ...(results.flat() as unknown as MemberLog[]).sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? a.logIndex - b.logIndex
          : a.blockNumber < b.blockNumber
            ? -1
            : 1,
      ),
    );
    from = to + 1n;
  }
  return logs;
}

function replay(members: bigint[], logs: MemberLog[]): void {
  for (const log of logs) {
    const args = log.args;
    switch (log.eventName) {
      case "MemberAdded":
        members[Number(args.index)] = args.identityCommitment as bigint;
        break;
      case "MembersAdded": {
        const start = Number(args.startIndex);
        (args.identityCommitments as bigint[]).forEach((commitment, i) => {
          members[start + i] = commitment;
        });
        break;
      }
      case "MemberUpdated":
        members[Number(args.index)] = args.newIdentityCommitment as bigint;
        break;
      case "MemberRemoved":
        members[Number(args.index)] = 0n;
        break;
    }
  }
}

/**
 * The ordered member (leaf) array of a group, replayed from events and
 * root-checked against the contract. Removed members appear as 0.
 */
export async function getGroupMembers(
  module: Semaphore,
  groupId: bigint,
  h: Hash2,
): Promise<bigint[]> {
  const { chainId, deployBlock } = await requireSemaphore(module);
  const client = await module.getClient();
  // cacheTime 0: viem caches block numbers for seconds, which under a
  // simulation (blocks mined per action) would hide just-added members.
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  const key = `${chainId}:${groupId}`;
  const cached = module.getMemberCache(key);
  const members = cached ? [...cached.members] : [];
  const fromBlock = cached ? cached.lastBlock + 1n : deployBlock;
  if (fromBlock <= latest) {
    module.context.log(
      `semaphore: scanning group ${groupId} members${cached ? " (incremental)" : ""}…`,
    );
    replay(members, await getMemberLogs(module, groupId, fromBlock, latest));
  }
  const onchainRoot = await readSemaphore(module, "getMerkleTreeRoot", [
    groupId,
  ]);
  const replayedRoot = members.length ? leanRoot(members, h) : 0n;
  if (replayedRoot !== onchainRoot) {
    throw new ErrorException(
      `semaphore: reconstructed member set of group ${groupId} does not match the on-chain root (got ${replayedRoot}, expected ${onchainRoot}) — the RPC may have missed events; retry or lower $semaphore:deployBlock`,
    );
  }
  module.setMemberCache(key, { members: [...members], lastBlock: latest });
  return members;
}
