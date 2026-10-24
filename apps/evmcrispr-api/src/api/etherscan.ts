import {
  ADDRESS,
  type ApiContext,
  errorText,
  json,
  originPermitted,
  rateLimit,
  readBody,
  secret,
  upstream,
} from "./common.js";

export const ETHERSCAN = "https://api.etherscan.io/v2/api";
type Shape = "address" | "addresses" | "number" | "page" | "sort" | "token";
const REQUESTS: Record<
  string,
  { method: string; params: Record<string, Shape> }
> = {
  "contract/getsourcecode": { method: "GET", params: { address: "address" } },
  "contract/getcontractcreation": {
    method: "GET",
    params: { contractaddresses: "addresses" },
  },
  "contract/checkverifystatus": { method: "GET", params: { guid: "token" } },
  "contract/verifysourcecode": { method: "POST", params: {} },
  "account/txlist": {
    method: "GET",
    params: {
      address: "address",
      startblock: "number",
      endblock: "number",
      page: "number",
      offset: "page",
      sort: "sort",
    },
  },
};
const SUBMIT_FIELDS = new Set([
  "contractaddress",
  "sourceCode",
  "codeformat",
  "contractname",
  "compilerversion",
  "licenseType",
  "constructorArguements",
  "optimizationUsed",
  "runs",
  "evmversion",
]);

function fits(shape: Shape, value: string): boolean {
  switch (shape) {
    case "address":
      return ADDRESS.test(value);
    case "addresses":
      return (
        value.split(",").length <= 5 &&
        value.split(",").every((v) => ADDRESS.test(v))
      );
    case "number":
      return /^\d{1,12}$/.test(value);
    case "page":
      return /^\d{1,12}$/.test(value) && Number(value) <= 100;
    case "sort":
      return value === "asc" || value === "desc";
    case "token":
      return /^[a-zA-Z0-9]{1,100}$/.test(value);
  }
}

export function etherscanQuery(
  method: string,
  input: URLSearchParams,
): URLSearchParams | string {
  const module = input.get("module") ?? "";
  const action = input.get("action") ?? "";
  const kind = REQUESTS[`${module}/${action}`];
  if (!kind) return "this module and action are not served here";
  if (kind.method !== method) return "wrong method for this action";
  const chain = input.get("chainid") ?? "";
  if (!/^\d{1,12}$/.test(chain)) return "chainid must be a number";
  const result = new URLSearchParams({ chainid: chain, module, action });
  for (const [name, shape] of Object.entries(kind.params)) {
    const value = input.get(name);
    if (value === null) continue;
    if (!fits(shape, value))
      return "a parameter is not of the shape this action takes";
    result.set(name, value);
  }
  return result;
}

export function isVerification(body: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    if (/[^a-zA-Z0-9*._+%=&-]/.test(text)) return false;
    return text
      .split("&")
      .filter(Boolean)
      .every((pair) =>
        SUBMIT_FIELDS.has(
          decodeURIComponent(pair.split("=")[0].replaceAll("+", " ")),
        ),
      );
  } catch {
    return false;
  }
}

export async function etherscan(
  ctx: ApiContext,
  req: Request,
  peer: string,
): Promise<Response> {
  if (!originPermitted(ctx, req))
    return json(403, { error: "this origin may not ask here" });
  const query = etherscanQuery(req.method, new URL(req.url).searchParams);
  if (typeof query === "string") return json(400, { error: query });
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (req.method === "POST") {
    const read = await readBody(req, 4 * 1024 * 1024, "submission too large");
    if (read instanceof Response) return read;
    if (!isVerification(read))
      return json(400, {
        error: "the body may only carry the fields of a verification",
      });
    body = read;
  }
  const refused = rateLimit(
    ctx,
    req,
    peer,
    "ETHERSCAN",
    { window: 600, perAddress: 200, total: 1500 },
    "too many requests; try again later",
  );
  if (refused) return refused;
  const key = secret(ctx, "ETHERSCAN_API_KEY").replace(/[^a-zA-Z0-9]/g, "");
  if (!key) return json(500, { error: "Etherscan is not configured" });
  query.set("apikey", key);
  try {
    const response = await upstream(ctx, `${ETHERSCAN}?${query}`, {
      method: req.method,
      headers: body
        ? { "content-type": "application/x-www-form-urlencoded" }
        : undefined,
      body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return json(502, {
      error: "Etherscan unreachable",
      details: errorText(ctx, error),
    });
  }
}
