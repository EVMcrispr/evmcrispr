import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Http from "..";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

export default defineHelper<Http>({
  name: "fetch",
  description:
    "Fetch an HTTP(S) URL or return explicitly supplied stdin: text.",
  returnType: "string",
  args: [
    {
      name: "url",
      type: "string",
      description: "HTTP(S) URL, or stdin: for host-supplied input",
    },
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
  async run(module, { url, method, body, auth }) {
    if (url === "stdin:") {
      if (method !== undefined || body !== undefined || auth !== undefined)
        throw new ErrorException(
          "@fetch(stdin:) does not accept method, body, or auth arguments",
        );
      const input = module.context.stdin;
      if (input === undefined)
        throw new ErrorException(
          "No script input supplied: pipe text into evmcrispr run <script.evml>, or choose an input file in the terminal. With run -, stdin is used for the script itself.",
        );
      return input;
    }
    let parsed: URL;
    try {
      parsed = new URL(String(url));
    } catch {
      throw new ErrorException(
        "@fetch expects an HTTP(S) URL; supply local data through stdin instead",
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new ErrorException(
        "@fetch expects an HTTP(S) URL; supply local data through stdin instead",
      );
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
