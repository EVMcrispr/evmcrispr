import { isIP } from "node:net";
import { ApiStore, type Limits } from "./store.js";

export type Fetcher = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface ApiContext {
  env: Record<string, string | undefined>;
  store: ApiStore;
  fetch: Fetcher;
  now: () => number;
  sleep: (ms: number) => Promise<unknown>;
}

export const YEAR = 365 * 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const DEFAULT_ORIGINS =
  "https://evmcrispr.com,https://*.evmcrispr.com,http://localhost:*,http://127.0.0.1:*";

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function json(
  status: number,
  value: unknown,
  extra?: HeadersInit,
): Response {
  return Response.json(value, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(extra)),
    },
  });
}

export function preflight(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": methods,
      "access-control-allow-headers": "*",
      "access-control-max-age": "3600",
    },
  });
}

export function secret(
  ctx: ApiContext,
  name: "PINATA_JWT" | "ETHERSCAN_API_KEY" | "TAVILY_API_KEY",
): string {
  return ctx.env[name] ?? ctx.env[`VITE_${name}`] ?? "";
}

export function errorText(ctx: ApiContext, error: unknown): string {
  let text = error instanceof Error ? error.message : String(error);
  for (const name of [
    "PINATA_JWT",
    "ETHERSCAN_API_KEY",
    "TAVILY_API_KEY",
  ] as const) {
    const value = secret(ctx, name);
    if (value) text = text.replaceAll(value, "***");
  }
  return text
    .replace(/([?&](?:apikey|api_key|token|jwt)=)[^&\s]*/gi, "$1***")
    .replace(/["\r\n]/g, "")
    .slice(0, 500);
}

export function envNumber(
  ctx: ApiContext,
  key: string,
  fallback: number,
): number {
  const raw = ctx.env[key];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : fallback;
}

export function chainId(raw: string, positive = false): string | undefined {
  if (!/^\d{1,20}$/.test(raw)) return undefined;
  const n = BigInt(raw);
  return n <= 0xffffffffffffffffn && (!positive || n > 0n)
    ? String(n)
    : undefined;
}

export function originAllowed(origin: string, entries: string): boolean {
  return entries.split(",").some((entry) => {
    const value = entry.trim();
    if (value === "*" || value === origin) return true;
    const parts = value.split("*");
    if (
      parts.length !== 2 ||
      !origin.startsWith(parts[0]) ||
      !origin.endsWith(parts[1])
    )
      return false;
    const middle = origin.slice(
      parts[0].length,
      origin.length - parts[1].length,
    );
    return /^[a-zA-Z0-9-]+$/.test(middle);
  });
}

export function originPermitted(ctx: ApiContext, req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null
    ? originAllowed(origin, ctx.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS)
    : req.headers.get("sec-fetch-site") !== "cross-site";
}

/** A proxy header is used only when deployment explicitly configures it. */
export function clientAddress(
  ctx: ApiContext,
  req: Request,
  peer: string,
): string {
  const header = ctx.env.CLIENT_ADDRESS_HEADER;
  let raw = header
    ? (req.headers.get(header)?.split(",").at(-1)?.trim() ?? "unknown")
    : peer;
  if (raw.startsWith("[")) raw = raw.slice(1, raw.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(raw))
    raw = raw.slice(0, raw.lastIndexOf(":"));
  const family = isIP(raw);
  if (family === 4) return raw;
  if (family === 6) {
    const normalized = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
    if (normalized.startsWith("::ffff:")) {
      const words = normalized.slice(7).split(":");
      if (words.length === 2) {
        const n = parseInt(words[0], 16) * 65536 + parseInt(words[1], 16);
        return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
      }
    }
    const [left, right] = normalized.split("::");
    const a = left ? left.split(":") : [];
    const b = right ? right.split(":") : [];
    const words =
      right === undefined
        ? a
        : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
    return `${words
      .slice(0, 4)
      .map((word) => parseInt(word, 16).toString(16))
      .join(":")}::/64`;
  }
  return "unknown";
}

export function rateLimit(
  ctx: ApiContext,
  req: Request,
  peer: string,
  prefix: string,
  defaults: Limits,
  message: string,
): Response | undefined {
  const limits = {
    window: envNumber(ctx, `${prefix}_WINDOW_SECS`, defaults.window),
    perAddress: envNumber(ctx, `${prefix}_LIMIT`, defaults.perAddress),
    total: envNumber(ctx, `${prefix}_TOTAL_LIMIT`, defaults.total),
  };
  try {
    const wait = ctx.store.count(
      prefix,
      clientAddress(ctx, req, peer),
      limits,
      Math.floor(ctx.now() / 1000),
    );
    if (wait !== undefined)
      return json(429, { error: message }, { "retry-after": String(wait) });
  } catch {
    return json(503, { error: "unavailable right now" });
  }
  return undefined;
}

export async function readBody(
  req: Request,
  max: number,
  message: string,
): Promise<Uint8Array<ArrayBuffer> | Response> {
  const declared = req.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && BigInt(declared) > BigInt(max))
    return json(413, { error: message, maxBytes: max });
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return json(413, { error: message, maxBytes: max });
      }
      chunks.push(value);
    }
  } catch {
    return json(400, { error: "the request was cut short" });
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function upstream(
  ctx: ApiContext,
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  return ctx.fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
}

export function fresh(at: number, ttl: number, now: number): boolean {
  return Math.max(0, now - at) < ttl;
}

export function createContext(options: Partial<ApiContext> = {}): ApiContext {
  const env = options.env ?? process.env;
  return {
    env,
    store: options.store ?? new ApiStore(),
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    now: options.now ?? Date.now,
    sleep: options.sleep ?? Bun.sleep,
  };
}
