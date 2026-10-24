import { type ApiContext, errorText, json, upstream } from "./common.js";

const DEFAULT_TARGETS =
  "https://mainnet.serve.giveth.io/graphql,https://auth.giveth.io/v1,https://api.gelato.digital/automate/users/users/web3-function,https://api.gelato.digital/1balance";

export function allowedProxyTarget(target: URL, configured: string): boolean {
  if (target.protocol !== "https:" || target.username || target.password)
    return false;
  return configured
    .split(",")
    .filter(Boolean)
    .some((entry) => {
      try {
        const allowed = new URL(entry.trim());
        const prefix = allowed.pathname.replace(/\/$/, "");
        return (
          target.origin === allowed.origin &&
          (target.pathname === prefix ||
            target.pathname.startsWith(`${prefix}/`))
        );
      } catch {
        return false;
      }
    });
}

export async function corsProxy(
  ctx: ApiContext,
  req: Request,
): Promise<Response> {
  let target: URL;
  try {
    target = new URL(
      req.url.slice(req.url.indexOf("/cors-proxy/") + "/cors-proxy/".length),
    );
  } catch {
    return json(400, {
      error:
        "Malformed or missing target URL. Usage: /cors-proxy/https://<target>",
    });
  }
  if (
    !allowedProxyTarget(
      target,
      ctx.env.ALLOWED_TARGET_DOMAINS ?? DEFAULT_TARGETS,
    )
  )
    return json(403, { error: "Target domain not allowed" });
  const headers = new Headers(req.headers);
  for (const name of [
    "host",
    "origin",
    "referer",
    "connection",
    "transfer-encoding",
    "proxy-authorization",
    "proxy-authenticate",
    "te",
    "trailer",
    "upgrade",
    "content-length",
    "x-forwarded-host",
    "x-forwarded-for",
    "forwarded",
    "cf-connecting-ip",
    "cf-ray",
  ])
    headers.delete(name);
  try {
    const response = await upstream(ctx, target, {
      method: req.method,
      headers,
      body:
        req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
    const out = new Headers(response.headers);
    for (const name of [...out.keys()])
      if (
        name.startsWith("access-control-") ||
        [
          "connection",
          "transfer-encoding",
          "content-length",
          "content-encoding",
        ].includes(name)
      )
        out.delete(name);
    out.set("access-control-allow-origin", "*");
    out.set(
      "access-control-allow-methods",
      "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    );
    out.set("access-control-allow-headers", "*");
    return new Response(response.body, {
      status: response.status,
      headers: out,
    });
  } catch (error) {
    return json(502, {
      error: "Error sending upstream request",
      details: errorText(ctx, error),
    });
  }
}
