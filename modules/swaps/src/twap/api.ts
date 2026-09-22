import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { PROGRAMMATIC_API, TWAP_NETWORKS } from "./networks";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ErrorException("Invalid CoW API object");
  return value as Record<string, unknown>;
}

const MAX_RESPONSE = 2_000_000;
/** An error body only has to carry `errorType`/`description`; anything longer
 *  is a body we refuse to hold on to, not a classification input. */
const MAX_ERROR_RESPONSE = 8_000;
const MAX_DESCRIPTION = 256;
const ERROR_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * A CoW API response that was not OK, with the bounded, parsed part of its
 * body that classifies it: the documented `errorType` and its description
 * (see the orderbook OpenAPI's `PriceEstimationError`). Both are absent when
 * the body was missing, oversized, not JSON or not shaped like one.
 */
export class CowApiError extends ErrorException {
  constructor(
    readonly status: number,
    readonly errorType?: string,
    readonly description?: string,
  ) {
    super(
      `CoW API request failed (HTTP ${status}${errorType ? `, ${errorType}` : ""})${
        description ? `: ${description}` : ""
      }`,
    );
  }
}

async function readBounded(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new ErrorException("Empty CoW API response");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit)
        throw new ErrorException("CoW API response is too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
  }
}

/** The documented failure fields of a bounded error body, or nothing. An
 *  unreadable, oversized or non-JSON body classifies nothing; the status
 *  alone still fails the request. */
async function errorDetail(
  response: Response,
): Promise<{ errorType?: string; description?: string }> {
  try {
    const parsed: unknown = JSON.parse(
      await readBounded(response, MAX_ERROR_RESPONSE),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const { errorType, description } = parsed as Record<string, unknown>;
    return {
      errorType:
        typeof errorType === "string" && ERROR_TYPE.test(errorType)
          ? errorType
          : undefined,
      description:
        typeof description === "string"
          ? // It lands in a message a person reads: one line, bounded.
            description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION)
          : undefined,
    };
  } catch {
    return {};
  }
}

/** Bounded requests, including response bodies. Never used to submit orders. */
export async function cowJson(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) {
    const { errorType, description } = await errorDetail(response);
    throw new CowApiError(response.status, errorType, description);
  }
  return JSON.parse(await readBounded(response, MAX_RESPONSE));
}

export function orderbookUrl(chainId: number): string {
  const network = TWAP_NETWORKS[chainId];
  if (!network) throw new ErrorException(`Unknown CoW TWAP network ${chainId}`);
  return `https://api.cow.fi/${network.slug}`;
}

export async function indexedOrders(
  chainId: number,
  owner?: Address,
  offset = 0,
) {
  const result = record(
    await cowJson(PROGRAMMATIC_API, {
      query: `query Orders($chainId:Int!,$owner:String,$offset:Int!){
      programmaticOrders(where:{chainId:$chainId,orderType:TWAP,resolvedOwner:$owner},
        limit:100,offset:$offset,orderBy:"creationDate",orderDirection:"desc"){
        items{eventId chainId owner hash txHash creationDate status partOrdersCount} totalCount
      }}`,
      variables: { chainId, owner: owner?.toLowerCase(), offset },
    }),
  );
  if (result.errors)
    throw new ErrorException("CoW TWAP indexer returned errors");
  const page = record(record(result.data).programmaticOrders);
  if (!Array.isArray(page.items) || page.items.length > 100)
    throw new ErrorException("Invalid CoW TWAP indexer page");
  return page.items.map(record);
}

export async function orderbookOrders(chainId: number, uids: Hex[]) {
  if (uids.length > 128)
    throw new ErrorException("CoW order lookup exceeds 128 UIDs");
  if (!uids.length) return [];
  const result = await cowJson(
    `${orderbookUrl(chainId)}/api/v1/orders/by_uids`,
    uids,
  );
  if (!Array.isArray(result) || result.length > 128)
    throw new ErrorException("Invalid CoW orderbook response");
  return result
    .map(record)
    .filter((item) => item.order)
    .map((item) => record(item.order));
}

export async function accountTrades(
  chainId: number,
  owner: Address,
  offset: number,
) {
  const data = await cowJson(
    `${orderbookUrl(chainId)}/api/v2/trades?owner=${owner}&offset=${offset}&limit=100`,
  );
  if (!Array.isArray(data) || data.length > 100)
    throw new ErrorException("Invalid CoW trade page");
  return data.map(record);
}
