import {
  type Hex,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerialized,
} from "viem";
import {
  type ApiContext,
  errorText,
  json,
  object,
  readBody,
  string,
  upstream,
} from "./common.js";

const DEFAULT_CHAINS =
  "eezL1=7331,https://eez.asuscomm.com/rpc/l1,https://eez.asuscomm.com/composer/l1;eezL2=6290,https://eez.asuscomm.com/rpc/l2,https://eez.asuscomm.com/composer/l2";
const CROSS_CHAIN_REVERTS = ["0xed6bc750", "0x9a499f3b", "0xf9d330ad"];
const WRAPPERS: Record<string, [number, number]> = {
  "0x6c544f33": [0, 1],
  "0xf8ec3958": [0, 1],
  "0x56573122": [1, 2],
};
type Call = Record<string, unknown>;
interface Chain {
  id: string;
  execution: string;
  front: string;
}

function chains(ctx: ApiContext): Map<string, Chain> {
  const result = new Map<string, Chain>();
  for (const entry of (ctx.env.EEZ_CHAINS ?? DEFAULT_CHAINS).split(";")) {
    const at = entry.indexOf("=");
    const [id, execution, front, extra] = entry
      .slice(at + 1)
      .split(",")
      .map((v) => v.trim());
    if (
      at <= 0 ||
      !/^\d+$/.test(id) ||
      !execution ||
      !front ||
      extra !== undefined
    )
      continue;
    try {
      if ([execution, front].some((v) => new URL(v).protocol !== "https:"))
        continue;
      result.set(entry.slice(0, at).trim(), { id, execution, front });
    } catch {
      /* Ignore incomplete deployment configuration. */
    }
  }
  return result;
}

function rpcError(id: unknown, code: number, message: string): Response {
  return json(200, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

function hex(value: unknown): string | undefined {
  return typeof value === "string" && /^0x(?:[a-fA-F0-9]{2})*$/.test(value)
    ? value.toLowerCase()
    : undefined;
}

function word(args: string, index: number): string | undefined {
  const result = args.slice(index * 64, (index + 1) * 64);
  return result.length === 64 ? result : undefined;
}

function dynamicBytes(args: string, index: number): string | undefined {
  const offsetWord = word(args, index);
  const offset = offsetWord ? Number(BigInt(`0x${offsetWord}`)) * 2 : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > args.length)
    return undefined;
  const length = Number(BigInt(`0x${args.slice(offset, offset + 64)}`)) * 2;
  if (!Number.isSafeInteger(length) || offset + 64 + length > args.length)
    return undefined;
  return `0x${args.slice(offset + 64, offset + 64 + length)}`;
}

export function unwrapCall(
  data: string,
): { to: string; data: string } | undefined {
  const wrapper = WRAPPERS[data.slice(0, 10)];
  const value = hex(data);
  if (!wrapper || !value) return undefined;
  const args = value.slice(10);
  const address = word(args, wrapper[0]);
  const inner = dynamicBytes(args, wrapper[1]);
  return address && inner
    ? { to: `0x${address.slice(24)}`, data: inner }
    : undefined;
}

export function safeInnerCalls(call: Call): Call[] {
  const data = hex(call.data);
  if (!data?.startsWith("0x6a761202") || typeof call.to !== "string") return [];
  const args = data.slice(10);
  const target = word(args, 0);
  const value = word(args, 1);
  const inner = dynamicBytes(args, 2);
  const op = word(args, 3);
  if (!target || !value || !inner || !op) return [];
  const asCall = (to: string, amount: string, input: string): Call => ({
    from: call.to,
    to,
    value: `0x${BigInt(`0x${amount}`).toString(16)}`,
    data: input,
  });
  if (BigInt(`0x${op}`) === 0n)
    return [asCall(`0x${target.slice(24)}`, value, inner)];
  if (BigInt(`0x${op}`) !== 1n || !inner.startsWith("0x8d80ff0a")) return [];
  const packed = dynamicBytes(inner.slice(10), 0)?.slice(2);
  if (!packed) return [];
  const calls: Call[] = [];
  let at = 0;
  while (at + 170 <= packed.length && calls.length < 32) {
    const length = Number(BigInt(`0x${packed.slice(at + 106, at + 170)}`)) * 2;
    if (!Number.isSafeInteger(length) || at + 170 + length > packed.length)
      break;
    if (packed.slice(at, at + 2) === "00")
      calls.push(
        asCall(
          `0x${packed.slice(at + 2, at + 42)}`,
          packed.slice(at + 42, at + 106),
          `0x${packed.slice(at + 170, at + 170 + length)}`,
        ),
      );
    at += 170 + length;
  }
  return calls;
}

async function rpc(
  ctx: ApiContext,
  url: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const response = await upstream(ctx, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (response.status >= 500)
    throw new Error(`upstream answered HTTP ${response.status}`);
  return object(await response.json());
}

async function isCrossChain(
  ctx: ApiContext,
  chain: Chain,
  call: Call,
  response: Call,
  depth = 0,
  budget = { left: 32, until: ctx.now() + 15_000 },
): Promise<boolean> {
  const error = object(response.error);
  const data = hex(
    typeof error.data === "string" ? error.data : object(error.data).data,
  );
  if (!data) return false;
  if (CROSS_CHAIN_REVERTS.some((selector) => data.startsWith(selector)))
    return true;
  if (depth >= 3 || budget.left <= 0 || ctx.now() > budget.until) return false;
  const wrapped = unwrapCall(data);
  const calls = wrapped
    ? [{ from: call.from ?? "", ...wrapped }]
    : safeInnerCalls(call);
  for (const inner of calls) {
    if (budget.left-- <= 0 || ctx.now() > budget.until) break;
    try {
      const result = await rpc(ctx, chain.execution, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [inner, "latest"],
      });
      if (await isCrossChain(ctx, chain, inner, result, depth + 1, budget))
        return true;
    } catch {
      /* A failed replay provides no evidence of a cross-chain call. */
    }
  }
  return false;
}

async function decodeCall(raw: string): Promise<Call | undefined> {
  try {
    if (!hex(raw)) return undefined;
    const transaction = parseTransaction(raw as Hex);
    const from = await recoverTransactionAddress({
      serializedTransaction: raw as TransactionSerialized,
    });
    return {
      from,
      to: transaction.to ?? null,
      data: transaction.data ?? "0x",
      value: `0x${(transaction.value ?? 0n).toString(16)}`,
    };
  } catch {
    return undefined;
  }
}

async function syncFront(ctx: ApiContext, chain: Chain): Promise<void> {
  const block = async (url: string): Promise<bigint> => {
    const answer = await rpc(ctx, url, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    });
    if (
      typeof answer.result !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(answer.result)
    )
      throw new Error("no block number from upstream");
    return BigInt(answer.result);
  };
  const target = await block(chain.execution);
  for (let waited = 0; ; waited++) {
    if ((await block(chain.front)) >= target) return;
    if (waited >= 30)
      throw new Error("front is behind execution RPC after 30s");
    await ctx.sleep(1000);
  }
}

export async function eez(
  ctx: ApiContext,
  req: Request,
  key: string,
): Promise<Response> {
  const configured = chains(ctx);
  const chain = configured.get(key.replace(/\/$/, ""));
  if (!chain)
    return json(404, {
      error: `unknown EEZ chain '${key}'; known: ${[...configured.keys()].join(", ")}`,
    });
  if (req.method !== "POST")
    return json(405, {
      error: "method not allowed; POST a JSON-RPC 2.0 request",
    });
  const body = await readBody(req, 10 * 1024 * 1024, "RPC request too large");
  if (body instanceof Response) return body;
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return rpcError(null, -32600, "invalid JSON-RPC request");
  }
  const parsed = object(input);
  const id = parsed.id ?? null;
  const method = string(parsed.method);
  const forward = async (target: string): Promise<Response> => {
    try {
      const response = await upstream(ctx, target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (response.status >= 500)
        throw new Error(`upstream answered HTTP ${response.status}`);
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      return rpcError(
        null,
        -32603,
        `upstream unreachable: ${errorText(ctx, error)}`,
      );
    }
  };
  if (method === "eth_fillTransaction")
    return rpcError(id, -32601, "Method not found");
  const params = Array.isArray(parsed.params) ? parsed.params : [];
  if (method === "eth_estimateGas") {
    try {
      const result = await rpc(ctx, chain.execution, input);
      return json(
        200,
        (await isCrossChain(ctx, chain, object(params[0]), result))
          ? { jsonrpc: "2.0", id, result: "0xaae60" }
          : result,
      );
    } catch (error) {
      return rpcError(
        id,
        -32603,
        `execution RPC unreachable: ${errorText(ctx, error)}`,
      );
    }
  }
  if (method === "eth_sendRawTransaction") {
    const call = await decodeCall(string(params[0]));
    if (call) {
      try {
        const result = await rpc(ctx, chain.execution, {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [call, "latest"],
        });
        if (await isCrossChain(ctx, chain, call, result)) {
          try {
            await syncFront(ctx, chain);
          } catch (error) {
            return rpcError(
              id,
              -32603,
              `front not in sync with execution RPC: ${errorText(ctx, error)}`,
            );
          }
          return forward(chain.front);
        }
      } catch (error) {
        return rpcError(
          id,
          -32603,
          `execution RPC unreachable: ${errorText(ctx, error)}`,
        );
      }
    }
  }
  return forward(chain.execution);
}
