import {
  type ApiContext,
  errorText,
  json,
  object,
  originPermitted,
  rateLimit,
  readBody,
  secret,
  upstream,
} from "./common.js";

export async function pin(
  ctx: ApiContext,
  req: Request,
  peer: string,
): Promise<Response> {
  if (!originPermitted(ctx, req))
    return json(403, { error: "this origin may not pin here" });
  const body = await readBody(req, 10 * 1024 * 1024, "upload too large");
  if (body instanceof Response) return body;
  const contentType = req.headers.get("content-type") ?? "";
  let endpoint: string;
  if (contentType.toLowerCase().startsWith("application/json")) {
    try {
      const parsed = object(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
      );
      if (!Object.hasOwn(parsed, "pinataContent"))
        throw new Error("missing pinataContent");
    } catch {
      return json(400, {
        error: "a JSON body must be an object with pinataContent",
      });
    }
    endpoint = "pinJSONToIPFS";
  } else if (contentType.toLowerCase().startsWith("multipart/form-data"))
    endpoint = "pinFileToIPFS";
  else
    return json(415, { error: "send application/json or multipart/form-data" });
  const refused = rateLimit(
    ctx,
    req,
    peer,
    "PIN",
    { window: 600, perAddress: 30, total: 600 },
    "too many pins; try again later",
  );
  if (refused) return refused;
  const token = secret(ctx, "PINATA_JWT");
  if (!token) return json(500, { error: "pinning is not configured" });
  try {
    // Preserve every byte: the client verifies Pinata's CID against this body.
    const response = await upstream(
      ctx,
      `https://api.pinata.cloud/pinning/${endpoint}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": contentType,
        },
        body,
      },
    );
    if (response.status === 429)
      return json(429, { error: "pinning service rate limit reached" });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = object(JSON.parse(text));
    } catch {
      /* Report the bounded upstream error below. */
    }
    if (response.status === 200 && typeof parsed.IpfsHash === "string")
      return json(200, { cid: parsed.IpfsHash });
    return json(502, {
      error: "pinning failed",
      status: response.status,
      details: errorText(ctx, text.slice(0, 300)),
    });
  } catch (error) {
    return json(502, {
      error: "pinning service unreachable",
      details: errorText(ctx, error),
    });
  }
}
