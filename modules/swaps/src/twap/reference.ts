import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Hex, PublicClient } from "viem";
import { decodeEventLog, getAddress, isAddressEqual, isHash } from "viem";
import type Swaps from "..";
import { activeSimMode } from "../utils/sim";
import { locateAccount } from "./account";
import { programmaticOrder } from "./api";
import { COMPOSABLE_COW, cowAbi, decodeSchedule, orderHash } from "./cow";
import { TWAP_NETWORKS } from "./networks";
import type { ConditionalOrderParams, TwapReference } from "./types";

type Registered = { account: Hex; params: ConditionalOrderParams };

export function parseOrderHash(value: unknown): Hex {
  if (typeof value !== "string" || !isHash(value))
    throw new ErrorException(
      "Invalid TWAP order; pass the order hash bound by swaps:twap",
    );
  return value.toLowerCase() as Hex;
}

/** Builds the reference swaps:twap would have held, from chain data alone. */
async function toReference(
  client: PublicClient,
  chainId: number,
  { account, params }: Registered,
): Promise<TwapReference> {
  decodeSchedule(params);
  const { controller, slot } = await locateAccount(client, chainId, account);
  return {
    version: 1,
    provider: "CoWSwap",
    chainId,
    controller,
    account,
    slot,
    params,
    orderHash: orderHash(params),
  };
}

/** Indexer rows are untrusted: each must match a ConditionalOrderCreated
 * event in the receipt of the transaction it names. */
async function indexedRegistrations(
  client: PublicClient,
  chainId: number,
  hash: Hex,
): Promise<Registered[]> {
  const found: Registered[] = [];
  for (const row of await programmaticOrder(chainId, hash)) {
    try {
      const { owner, handler, salt, staticInput, txHash } = row;
      if (
        typeof owner !== "string" ||
        typeof txHash !== "string" ||
        !isHash(txHash)
      )
        continue;
      const params = { handler, salt, staticInput } as ConditionalOrderParams;
      if (orderHash(params) !== hash) continue;
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") continue;
      const created = receipt.logs.some((log) => {
        if (!isAddressEqual(log.address, COMPOSABLE_COW)) return false;
        try {
          const event = decodeEventLog({
            abi: cowAbi,
            data: log.data,
            topics: log.topics,
            strict: true,
          });
          return (
            event.eventName === "ConditionalOrderCreated" &&
            isAddressEqual(event.args.owner, owner as Hex) &&
            orderHash(event.args.params) === hash
          );
        } catch {
          return false;
        }
      });
      if (created) found.push({ account: getAddress(owner), params });
    } catch {
      // A malformed or unverifiable row is a miss, not an answer.
    }
  }
  return found;
}

/** Newest blocks first: a just-mined order is usually in the first page. */
async function recentRegistrations(
  client: PublicClient,
  chainId: number,
  hash: Hex,
): Promise<Registered[]> {
  const head = (await client.getBlock()).number;
  const window = TWAP_NETWORKS[chainId].recentBlocks;
  const floor = head > window ? head - window : 0n;
  let to = head;
  let width = 5000n;
  while (to >= floor) {
    const from = to - width + 1n > floor ? to - width + 1n : floor;
    let logs: Awaited<ReturnType<typeof getCreated>>;
    try {
      logs = await getCreated(client, from, to);
    } catch {
      if (width === 1n)
        throw new ErrorException(
          "RPC could not read recent TWAP registrations",
        );
      width = width / 2n || 1n;
      continue;
    }
    const found = logs.filter((log) => orderHash(log.args.params) === hash);
    if (found.length)
      return found.map((log) => ({
        account: getAddress(log.args.owner),
        params: log.args.params,
      }));
    if (from === floor) break;
    to = from - 1n;
  }
  return [];
}

const getCreated = (client: PublicClient, fromBlock: bigint, toBlock: bigint) =>
  client.getLogs({
    address: COMPOSABLE_COW,
    event: cowAbi[8],
    fromBlock,
    toBlock,
    strict: true,
  });

/** One registration per order hash; the same params under two accounts
 * would make every later action ambiguous. */
async function single(
  client: PublicClient,
  chainId: number,
  hash: Hex,
  found: Registered[],
): Promise<TwapReference | undefined> {
  const refs: TwapReference[] = [];
  let refusal: ErrorException | undefined;
  for (const registered of found) {
    if (refs.some((ref) => isAddressEqual(ref.account, registered.account)))
      continue;
    try {
      refs.push(await toReference(client, chainId, registered));
    } catch (error) {
      // Registered by an account swaps:twap did not create, or with params
      // it would not encode. RPC failures still surface.
      if (!(error instanceof ErrorException)) throw error;
      refusal = error;
    }
  }
  // A verified registration that is not ours is an answer, not a miss.
  if (!refs.length && refusal)
    throw new ErrorException(
      `TWAP order ${hash} exists, but ${refusal.message}; only orders swaps:twap created can be managed here`,
    );
  if (refs.length > 1)
    throw new ErrorException(
      `TWAP order ${hash} is registered by several swaps:twap accounts`,
    );
  return refs[0];
}

/**
 * Finds an order by hash: CoW's programmatic-order indexer first, then the
 * most recent blocks for orders it has not indexed yet (or while it is
 * down). Everything used is verified on-chain.
 */
export async function findReference(
  client: PublicClient,
  chainId: number,
  order: unknown,
  { external = true }: { external?: boolean } = {},
): Promise<TwapReference> {
  const hash = parseOrderHash(order);
  if (!TWAP_NETWORKS[chainId])
    throw new ErrorException(
      `CoWSwap TWAP is not available on ${chainLabel(chainId)}`,
    );
  let indexer = "was skipped";
  if (external) {
    let indexed: Registered[] | undefined;
    try {
      indexed = await indexedRegistrations(client, chainId, hash);
    } catch {
      indexer = "was unavailable";
    }
    if (indexed) {
      const ref = await single(client, chainId, hash, indexed);
      if (ref) return ref;
      indexer = "does not list it";
    }
  }
  const ref = await single(
    client,
    chainId,
    hash,
    await recentRegistrations(client, chainId, hash),
  );
  if (ref) return ref;
  throw new ErrorException(
    `TWAP order ${hash} was not found on ${chainLabel(chainId)}: CoW's order indexer ${indexer} and it was not registered in about the last six hours of blocks. An order exists only once its registration transaction is mined.`,
  );
}

/** Orders created earlier in this run resolve before they are mined. */
export async function resolveReference(
  module: Swaps,
  order: unknown,
): Promise<TwapReference> {
  const chainId = await module.getChainId();
  const cached = module.twapOrders.get(`${chainId}:${parseOrderHash(order)}`);
  if (cached) return cached;
  return findReference(await module.getClient(), chainId, order, {
    external: !activeSimMode(module),
  });
}

export function rememberReference(module: Swaps, ref: TwapReference): void {
  module.twapOrders.set(`${ref.chainId}:${ref.orderHash.toLowerCase()}`, ref);
}
