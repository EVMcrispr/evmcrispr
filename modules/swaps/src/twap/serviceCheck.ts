import { ErrorException } from "@evmcrispr/sdk";
import { isAddress, isHash, isHex, size } from "viem";
import { cowJson, indexedOrders, orderbookOrders, record } from "./api";
import {
  PROGRAMMATIC_API,
  TWAP_CREATION_CHAINS,
  TWAP_UPSTREAM,
} from "./networks";

/** Explicit release verification, never submits a trade or signs anything. */
export async function checkTwapService(chainId: number) {
  const parents = await indexedOrders(chainId);
  for (const parent of parents.slice(0, 5)) {
    const createdAt = Number(parent.creationDate) * 1000;
    if (
      parent.chainId !== chainId ||
      typeof parent.eventId !== "string" ||
      typeof parent.owner !== "string" ||
      !isAddress(parent.owner, { strict: false }) ||
      typeof parent.txHash !== "string" ||
      !isHash(parent.txHash) ||
      !Number.isFinite(createdAt) ||
      createdAt > Date.now() ||
      Date.now() - createdAt > 7 * 86400_000
    )
      continue;
    const response = record(
      await cowJson(PROGRAMMATIC_API, {
        query: `query Parts($chainId:Int!,$id:String!){partOrders(where:{chainId:$chainId,conditionalOrderGeneratorId:$id},limit:100,orderBy:"sortKey",orderDirection:"desc"){items{orderUid status}totalCount}}`,
        variables: { chainId, id: parent.eventId },
      }),
    );
    if (response.errors)
      throw new ErrorException("CoW TWAP service check: indexer error");
    const page = record(record(response.data).partOrders);
    if (!Array.isArray(page.items) || page.items.length > 100)
      throw new ErrorException("CoW TWAP service check: malformed parts");
    const uids = page.items
      .map(record)
      .filter(
        (part) =>
          part.status === "fulfilled" &&
          typeof part.orderUid === "string" &&
          isHex(part.orderUid, { strict: true }) &&
          size(part.orderUid) === 56,
      )
      .map((part) => part.orderUid as `0x${string}`);
    const orders = await orderbookOrders(chainId, uids);
    const order = orders.find(
      (order) =>
        order.status === "fulfilled" &&
        order.signingScheme === "eip1271" &&
        String(order.owner).toLowerCase() ===
          String(parent.owner).toLowerCase() &&
        uids.includes(order.uid as `0x${string}`),
    );
    if (order)
      return {
        chainId,
        checkedAt: new Date().toISOString(),
        registrationObservedAt: new Date(createdAt).toISOString(),
        creationEnabled: TWAP_CREATION_CHAINS.has(chainId),
        eventId: parent.eventId,
        owner: parent.owner,
        registrationTx: parent.txHash,
        partUid: order.uid,
        orderbookStatus: order.status,
        signingScheme: order.signingScheme,
        upstream: TWAP_UPSTREAM,
      };
  }
  throw new ErrorException(
    `CoW TWAP service support not confirmed on chain ${chainId}; no fulfilled ERC-1271 sample found in the latest five parents registered within seven days`,
  );
}
