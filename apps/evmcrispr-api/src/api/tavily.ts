import {
  type ApiContext,
  errorText,
  json,
  object,
  rateLimit,
  secret,
  string,
  upstream,
} from "./common.js";

export async function tavily(
  ctx: ApiContext,
  req: Request,
  peer: string,
): Promise<Response> {
  const url = new URL(req.url);
  const search = url.pathname === "/search";
  const query = (url.searchParams.get("q") ?? "").trim();
  const target = url.searchParams.get("url") ?? "";
  if (search && !query)
    return json(400, {
      error: "missing query. Usage: /search?q=<query>&count=<1-10>",
    });
  if (!search) {
    try {
      if (new URL(target).protocol !== "https:") throw new Error("not HTTPS");
    } catch {
      return json(400, {
        error: "missing or non-https url. Usage: /extract?url=https://...",
      });
    }
  }
  const refused = rateLimit(
    ctx,
    req,
    peer,
    "TAVILY",
    { window: 600, perAddress: 60, total: 600 },
    "too many requests; try again later",
  );
  if (refused) return refused;
  const key = secret(ctx, "TAVILY_API_KEY");
  if (!key) return json(500, { error: "search service is not configured" });
  const rawCount = url.searchParams.get("count") ?? "";
  const count = /^\d+$/.test(rawCount)
    ? Math.min(10, Math.max(1, Number(rawCount)))
    : 5;
  const body = search
    ? { query, max_results: count, search_depth: "basic" }
    : { urls: target, format: "markdown" };
  try {
    const response = await upstream(
      ctx,
      `https://api.tavily.com/${search ? "search" : "extract"}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if ([429, 432].includes(response.status))
      return json(429, { error: "search quota or rate limit exceeded" });
    if (response.status !== 200)
      return json(502, {
        error: "upstream request failed",
        status: response.status,
        details: errorText(ctx, (await response.text()).slice(0, 300)),
      });
    const parsed = object(await response.json());
    const results = Array.isArray(parsed.results)
      ? parsed.results.map(object)
      : [];
    if (search)
      return json(200, {
        query,
        results: results.map((r) => ({
          title: r.title ?? null,
          url: r.url ?? null,
          description: r.content ?? null,
        })),
      });
    if (typeof results[0]?.raw_content === "string")
      return json(200, { url: target, content: results[0].raw_content });
    const failed = Array.isArray(parsed.failed_results)
      ? object(parsed.failed_results[0])
      : {};
    return json(502, {
      error: "extraction failed",
      details: errorText(ctx, string(failed.error) || "no content extracted"),
    });
  } catch (error) {
    return json(502, {
      error: "upstream request failed",
      details: errorText(ctx, error),
    });
  }
}
