import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Http from "..";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

export default defineHelper<Http>({
  name: "fetch",
  description: "Fetch a URL and return the response body as a string.",
  returnType: "string",
  args: [
    { name: "url", type: "string", description: "Request URL" },
    {
      name: "method",
      type: "string",
      description: "HTTP method (`GET`, `POST`, etc.)",
      optional: true,
    },
    {
      name: "body",
      type: "string",
      description: "Request body (JSON string)",
      optional: true,
    },
    {
      name: "auth",
      type: "string",
      description: "Authorization header value",
      optional: true,
    },
  ],
  async run(_, { url, method, body, auth }) {
    const httpMethod = method ? String(method).toUpperCase() : "GET";

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (auth) headers.Authorization = String(auth);

    if (body !== undefined && METHODS_WITH_BODY.has(httpMethod)) {
      headers["Content-Type"] = "application/json";
    }

    let res: Response;
    try {
      res = await fetch(String(url), {
        method: httpMethod,
        headers,
        body: body !== undefined ? String(body) : undefined,
      });
    } catch (err: unknown) {
      throw new ErrorException(
        `@fetch: network error – ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!res.ok) {
      throw new ErrorException(`@fetch: ${res.status} ${res.statusText}`);
    }

    return res.text();
  },
});
