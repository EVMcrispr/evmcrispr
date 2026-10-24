import {
  type ApiContext,
  chainId,
  errorText,
  fresh,
  json,
  object,
  string,
  upstream,
} from "./common.js";

const TTL = 12 * 60 * 60 * 1000;

export async function tokenlist(
  ctx: ApiContext,
  chain: string,
): Promise<Response> {
  const id = chainId(chain, true);
  const headers = { "cache-control": "public, max-age=300, s-maxage=300" };
  if (!id)
    return json(400, { error: "invalid chainId", chainId: chain }, headers);
  const key = `tokenlist_${id}`;
  const kept = ctx.store.get(key);
  if (kept && fresh(kept.at, TTL, ctx.now()))
    return json(200, kept.value, headers);
  const get = async (
    url: string,
    cacheKey: string,
    ttl: number,
  ): Promise<unknown> => {
    const cached = ctx.store.get(cacheKey);
    if (cached && fresh(cached.at, ttl, ctx.now())) return cached.value;
    try {
      const response = await upstream(ctx, url, {
        headers: { "user-agent": "evmcrispr-api/0.1 (+https://evmcrispr.com)" },
      });
      if (response.status !== 200)
        throw new Error(`HTTP ${response.status} from token list provider`);
      const data: unknown = await response.json();
      ctx.store.set(cacheKey, data, ctx.now());
      return data;
    } catch (error) {
      if (cached) return cached.value;
      throw error;
    }
  };
  try {
    const data = await get(
      "https://api.coingecko.com/api/v3/asset_platforms",
      "platforms",
      5 * 24 * 60 * 60 * 1000,
    );
    if (!Array.isArray(data))
      throw new Error("invalid asset platforms response");
    const platform = data
      .map(object)
      .find((p) => String(p.chain_identifier) === id);
    if (!platform || !string(platform.id))
      throw new Error(`unsupported chainId: ${id}`);
    const tokens = object(
      await get(
        `https://tokens.coingecko.com/${encodeURIComponent(string(platform.id))}/all.json`,
        `coingecko_${string(platform.id)}`,
        TTL,
      ),
    );
    const date = Date.parse(string(tokens.timestamp));
    const result = {
      name: `EVMcrispr Token List (${string(platform.name)})`,
      logoURI: "https://evmcrispr.com/favicon.ico",
      timestamp: new Date(Number.isFinite(date) ? date : 0).toISOString(),
      tokens: Array.isArray(tokens.tokens)
        ? tokens.tokens.map((value) => {
            const token = object(value);
            return {
              address: "",
              chainId: 0,
              name: "",
              symbol: "",
              decimals: 0,
              ...token,
            };
          })
        : [],
      version: { major: 1, minor: 0, patch: 0 },
    };
    ctx.store.set(key, result, ctx.now());
    return json(200, result, headers);
  } catch (error) {
    if (kept) return json(200, kept.value, headers);
    return json(
      502,
      { error: `failed to fetch token lists: ${errorText(ctx, error)}` },
      headers,
    );
  }
}
