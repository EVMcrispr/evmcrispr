import {
  ADDRESS,
  type ApiContext,
  chainId,
  errorText,
  fresh,
  HOUR,
  json,
  object,
  rateLimit,
  secret,
  string,
  upstream,
  YEAR,
} from "./common.js";
import { ETHERSCAN } from "./etherscan.js";

const BLOCKSCOUT: Record<string, string> = {
  "1": "https://eth.blockscout.com",
  "10": "https://explorer.optimism.io",
  "100": "https://gnosisscan.io",
  "42161": "https://arbitrum.blockscout.com",
  "8453": "https://base.blockscout.com",
};
const FOREVER = "public, max-age=31536000, immutable";
type Value = Record<string, unknown>;
type Lookup =
  | { kind: "verified"; meta: Value; source: Value }
  | { kind: "unverified" }
  | { kind: "miss"; details: string };
type Provider = "sourcify" | "etherscan" | "blockscout";

export function sourceFiles(raw: string, name: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  if (text.startsWith("{")) {
    try {
      const parsed = object(
        JSON.parse(
          text.startsWith("{{") && text.endsWith("}}")
            ? text.slice(1, -1)
            : text,
        ),
      );
      const entries = Object.entries(object(parsed.sources ?? parsed)).flatMap(
        ([path, file]) =>
          typeof object(file).content === "string"
            ? [[path, object(file).content as string] as const]
            : [],
      );
      if (entries.length) return Object.fromEntries(entries);
    } catch {
      /* A flattened source is kept as one file below. */
    }
  }
  return { [`${name || "Contract"}.sol`]: text };
}

function number(value: unknown): number | undefined {
  const n =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0
    ? n
    : undefined;
}

export function readVerified(
  provider: Provider,
  status: number,
  answer: unknown,
): Lookup {
  if (status === 429 || status >= 500) throw new Error(`status ${status}`);
  const value = object(answer);
  if (provider === "sourcify") {
    if (status === 404) return { kind: "unverified" };
    if (status !== 200)
      return {
        kind: "miss",
        details: `status ${status}: ${string(value.message) || "no answer"}`,
      };
    if (value.match == null) return { kind: "unverified" };
    const compilation = object(value.compilation);
    const name = string(compilation.name).trim();
    if (!name) throw new Error("no contract name in the answer");
    if (!Array.isArray(value.abi))
      throw new Error("invalid abi json: not an array");
    const settings = object(compilation.compilerSettings);
    const optimizer = object(settings.optimizer);
    const files = Object.fromEntries(
      Object.entries(object(value.sources)).flatMap(([path, file]) =>
        typeof object(file).content === "string"
          ? [[path, object(file).content] as const]
          : [],
      ),
    );
    const meta: Value = {
      name,
      abi: value.abi,
      compilerVersion: string(compilation.compilerVersion).replace(/^v+/, ""),
      optimizationUsed: optimizer.enabled === true,
      runs: number(optimizer.runs) ?? 0,
      isProxy: object(value.proxyResolution).isProxy === true,
      files: Object.keys(files).sort(),
    };
    if (
      string(settings.evmVersion) &&
      string(settings.evmVersion).toLowerCase() !== "default"
    )
      meta.evmVersion = settings.evmVersion;
    return { kind: "verified", meta, source: { ...meta, files } };
  }
  const entry = object(
    Array.isArray(value.result) ? value.result[0] : undefined,
  );
  if (value.status !== "1" || !Object.keys(entry).length) {
    const details =
      string(value.result) || string(value.message) || "no result";
    if (details.toLowerCase().includes("rate limit")) throw new Error(details);
    return { kind: "miss", details };
  }
  const name = string(entry.ContractName).trim();
  if (!name || entry.ABI === "Contract source code not verified")
    return { kind: "unverified" };
  let abi: unknown;
  try {
    abi = JSON.parse(string(entry.ABI));
  } catch {
    throw new Error("invalid abi json");
  }
  if (!Array.isArray(abi)) throw new Error("invalid abi json: not an array");
  let files = sourceFiles(string(entry.SourceCode), name);
  if (
    provider === "blockscout" &&
    Array.isArray(entry.AdditionalSources) &&
    entry.AdditionalSources.length
  ) {
    const main = string(entry.FileName);
    files = Object.fromEntries([
      ...(string(entry.SourceCode)
        ? [
            [
              main && main !== ".sol" ? main : `${name}.sol`,
              string(entry.SourceCode),
            ],
          ]
        : []),
      ...entry.AdditionalSources.map(object).flatMap((extra) =>
        typeof extra.Filename === "string" &&
        typeof extra.SourceCode === "string"
          ? [[extra.Filename, extra.SourceCode]]
          : [],
      ),
    ]);
  }
  const optimizer = object(object(entry.CompilerSettings).optimizer);
  const meta: Value = {
    name,
    abi,
    compilerVersion: string(entry.CompilerVersion).replace(/^v+/, ""),
    optimizationUsed:
      ["1", "true"].includes(string(entry.OptimizationUsed)) ||
      optimizer.enabled === true,
    runs:
      (provider === "blockscout"
        ? (number(entry.OptimizationRuns) ?? number(optimizer.runs))
        : number(entry.Runs)) ?? 0,
    isProxy:
      provider === "blockscout"
        ? entry.IsProxy === "true"
        : entry.Proxy === "1",
    files: Object.keys(files).sort(),
  };
  if (
    string(entry.EVMVersion) &&
    string(entry.EVMVersion).toLowerCase() !== "default"
  )
    meta.evmVersion = entry.EVMVersion;
  const license = string(entry.LicenseType).trim();
  if (license && !["None", "Unknown"].includes(license)) meta.license = license;
  // An implementation can change on upgrade; it is deliberately never cached.
  return { kind: "verified", meta, source: { ...meta, files } };
}

function etherscanUrl(
  ctx: ApiContext,
  chain: string,
  action: string,
  address: string,
): URL {
  const url = new URL(ETHERSCAN);
  url.search = new URLSearchParams({
    chainId: chain,
    module: "contract",
    action,
    address,
  }).toString();
  const key = secret(ctx, "ETHERSCAN_API_KEY").replace(/[^a-zA-Z0-9]/g, "");
  if (key) url.searchParams.set("apikey", key);
  return url;
}

function respond(status: number, body: Value): Response {
  const cache =
    status === 200 || (status === 404 && body.error === "no such file")
      ? FOREVER
      : status === 404 && body.error === "contract not verified"
        ? "public, max-age=3600"
        : "no-store";
  return json(status, body, { "cache-control": cache });
}

function found(value: Value, file: string | null): Response {
  if (file === null) return respond(200, value);
  const files = object(value.files);
  return Object.hasOwn(files, file)
    ? respond(200, {
        name: value.name,
        files: Object.fromEntries([[file, files[file]]]),
      })
    : respond(404, {
        error: "no such file",
        file,
        files: Object.keys(files).sort(),
      });
}

export async function contract(
  ctx: ApiContext,
  req: Request,
  peer: string,
  route: string,
  rawChain: string,
  rawAddress: string,
): Promise<Response> {
  const chain = chainId(rawChain);
  if (!chain || !ADDRESS.test(rawAddress))
    return respond(400, {
      error: "invalid address or chain id",
      chainId: rawChain,
      address: rawAddress,
    });
  const address = rawAddress.toLowerCase();
  const url = new URL(req.url);
  const file = route === "source" ? url.searchParams.get("file") : null;
  const caching = ctx.env.CONTRACT_KV_CACHE?.trim() === "on";
  const metaKey = `contract_${chain}_${address}`;
  const sourceKey = `source_${chain}_${address}`;
  const meta = caching ? ctx.store.get<Value>(metaKey) : undefined;
  const kept =
    route === "source"
      ? caching
        ? ctx.store.get<Value>(sourceKey)
        : undefined
      : meta;
  const notVerified = () =>
    respond(404, { error: "contract not verified", chainId: chain, address });
  if (meta?.value.verified === false && fresh(meta.at, HOUR, ctx.now()))
    return notVerified();
  if (kept && kept.value.verified !== false && fresh(kept.at, YEAR, ctx.now()))
    return found(kept.value, file);
  const refused = rateLimit(
    ctx,
    req,
    peer,
    "CONTRACT",
    { window: 600, perAddress: 60, total: 600 },
    "too many lookups; try again later",
  );
  if (refused) return refused;
  const providers: [Provider, string | URL][] = [];
  const sourcify = url.searchParams
    .getAll("sourcify")
    .some((v) => !["0", "false", "no", "off"].includes(v.toLowerCase()));
  if (sourcify)
    providers.push([
      "sourcify",
      `https://sourcify.dev/server/v2/contract/${chain}/${address}?fields=abi,compilation,sources,proxyResolution`,
    ]);
  providers.push([
    "etherscan",
    etherscanUrl(ctx, chain, "getsourcecode", address),
  ]);
  if (BLOCKSCOUT[chain])
    providers.push([
      "blockscout",
      `${BLOCKSCOUT[chain]}/api?module=contract&action=getsourcecode&address=${address}`,
    ]);
  const sources: Value[] = [];
  let unverified = false;
  let failed = false;
  for (const [provider, target] of providers) {
    try {
      const response = await upstream(ctx, target);
      // A Sourcify 404 has no required body; outages need no JSON parser.
      const answer =
        response.status === 404 && provider === "sourcify"
          ? {}
          : await response.json();
      const result = readVerified(provider, response.status, answer);
      if (result.kind === "verified") {
        if (caching) {
          ctx.store.set(sourceKey, result.source, ctx.now());
          ctx.store.set(metaKey, result.meta, ctx.now());
          if (!ctx.store.get(`abi_${chain}_${address}`))
            ctx.store.set(
              `abi_${chain}_${address}`,
              result.meta.abi,
              ctx.now(),
            );
        }
        return found(route === "source" ? result.source : result.meta, file);
      }
      if (result.kind === "unverified") {
        unverified = true;
        sources.push({ provider, error: "not verified" });
      } else
        sources.push({ provider, error: "no answer", details: result.details });
    } catch (error) {
      failed = true;
      sources.push({
        provider,
        error: "upstream request failed",
        details: errorText(ctx, error),
      });
    }
  }
  if (unverified) {
    if (caching) ctx.store.set(metaKey, { verified: false }, ctx.now());
    return notVerified();
  }
  if (failed && kept && kept.value.verified !== false)
    return found(kept.value, file);
  return respond(failed ? 502 : 404, {
    error: failed ? "upstream request failed" : "contract not found",
    chainId: chain,
    address,
    sources,
  });
}

export async function abi(
  ctx: ApiContext,
  rawChain: string,
  address: string,
): Promise<Response> {
  const chain = chainId(rawChain);
  if (!chain || !ADDRESS.test(address))
    return json(400, {
      error: "invalid address or chain id",
      chainId: rawChain,
      address,
    });
  const key = `abi_${chain}_${address.toLowerCase()}`;
  const kept = ctx.store.get(key);
  if (kept && fresh(kept.at, YEAR, ctx.now())) return json(200, kept.value);
  const sources: Value[] = [];
  const providers: [Provider, string | URL][] = [
    ["etherscan", etherscanUrl(ctx, chain, "getabi", address)],
  ];
  if (BLOCKSCOUT[chain])
    providers.push([
      "blockscout",
      `${BLOCKSCOUT[chain]}/api?module=contract&action=getabi&address=${address}`,
    ]);
  for (const [provider, target] of providers) {
    try {
      const response = await upstream(ctx, target);
      const answer = object(await response.json());
      if (answer.status !== "1") {
        sources.push({
          provider,
          error: answer.message ?? "",
          details: answer.result ?? "",
        });
        continue;
      }
      const result: unknown = JSON.parse(string(answer.result));
      ctx.store.set(key, result, ctx.now());
      return json(200, result);
    } catch (error) {
      if (kept) return json(200, kept.value);
      return json(502, {
        error: "upstream request failed",
        provider,
        chainId: rawChain,
        address,
        details: errorText(ctx, error),
      });
    }
  }
  return json(
    404,
    sources.length > 1
      ? { error: "abi not found", chainId: rawChain, address, sources }
      : {
          error: sources[0]?.error ?? "abi not found",
          details: sources[0]?.details ?? "",
        },
  );
}
