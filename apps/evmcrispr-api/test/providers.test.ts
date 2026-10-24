import { describe, expect, it } from "bun:test";
import { allowedProxyTarget } from "../src/api/proxy.js";
import { ADDRESS, reply, setup } from "./api-utils.js";

describe("keyed provider routes", () => {
  it("pins the exact JSON and multipart bytes with only the server token", async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    const api = setup(
      async (url, init) => {
        seen.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: await new Response(init?.body).text(),
        });
        expect(init?.redirect).toBe("manual");
        return reply({ IpfsHash: "bafy-content" });
      },
      { PINATA_JWT: "server-token", PIN_LIMIT: "2" },
    );
    const json =
      '{ "pinataContent": {"message":"hello 🌍"}, "pinataOptions":{"cidVersion":1} }';
    const multipart =
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="x"\r\n\r\nfile\r\n--boundary--\r\n';
    for (const [contentType, body] of [
      ["application/json", json],
      ["multipart/form-data; boundary=boundary", multipart],
    ]) {
      const response = await api.request("/ipfs/pin", {
        method: "POST",
        headers: {
          "content-type": contentType,
          authorization: "Bearer client-token",
          origin: "https://next.evmcrispr.com",
        },
        body,
      });
      expect(await response.json()).toEqual({ cid: "bafy-content" });
      expect(seen.at(-1)?.body).toBe(body);
      expect(seen.at(-1)?.headers.get("authorization")).toBe(
        "Bearer server-token",
      );
      expect(seen.at(-1)?.headers.get("content-type")).toBe(contentType);
    }
    expect(seen.map((r) => r.url)).toEqual([
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
    ]);
    const limited = await api.request("/ipfs/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
    expect(seen).toHaveLength(2);
  });

  it("rejects foreign browsers and malformed pin bodies without calling upstream", async () => {
    let calls = 0;
    const api = setup(
      async () => {
        calls++;
        return reply({});
      },
      { PINATA_JWT: "secret" },
    );
    for (const headers of [
      new Headers({ origin: "https://evil.test" }),
      new Headers({ "sec-fetch-site": "cross-site" }),
    ]) {
      expect(
        (
          await api.request("/ipfs/pin", {
            method: "POST",
            headers,
            body: "{}",
          })
        ).status,
      ).toBe(403);
    }
    for (const body of ["{}", "[]", "null", '{"other":1}', "invalid"])
      expect(
        (
          await api.request("/ipfs/pin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          })
        ).status,
      ).toBe(400);
    expect(
      (await api.request("/ipfs/pin", { method: "POST", body: "hello" }))
        .status,
    ).toBe(415);
    expect(calls).toBe(0);
  });

  it("filters Etherscan query parameters and forwards verification bytes unchanged", async () => {
    const requests: { url: URL; body: string }[] = [];
    const api = setup(
      async (url, init) => {
        requests.push({
          url: new URL(url),
          body: await new Response(init?.body).text(),
        });
        return reply({ status: "1", result: "ok" });
      },
      { ETHERSCAN_API_KEY: "server-key" },
    );
    const response = await api.request(
      `/etherscan?chainid=1&module=account&action=txlist&address=${ADDRESS}&offset=100&sort=asc&apikey=attacker&callback=evil`,
    );
    expect(response.status).toBe(200);
    expect(requests[0].url.origin).toBe("https://api.etherscan.io");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      chainid: "1",
      module: "account",
      action: "txlist",
      address: ADDRESS,
      offset: "100",
      sort: "asc",
      apikey: "serverkey",
    });
    const path = "/etherscan?chainid=1&module=contract&action=verifysourcecode";
    const body =
      "sourceCode=%7B%22a%22%3A%22%26apikey%3Dfake%22%7D&contractname=Foo%3AFoo&constructorArguements=0123";
    expect((await api.request(path, { method: "POST", body })).status).toBe(
      200,
    );
    expect(requests[1].body).toBe(body);
    for (const body of [
      "apikey=bad",
      "%61ction=txlist",
      "sourceCode=x&module=account",
      "sourceCode=x\n",
      "%ZZ=x",
    ])
      expect((await api.request(path, { method: "POST", body })).status).toBe(
        400,
      );
    for (const path of [
      "/etherscan?chainid=1&module=proxy&action=eth_call",
      "/etherscan?chainid=abc&module=contract&action=getsourcecode",
      `/etherscan?chainid=1&module=account&action=txlist&offset=101&address=${ADDRESS}`,
    ])
      expect((await api.request(path)).status).toBe(400);
    expect(requests).toHaveLength(2);
  });

  it("normalizes Tavily search/extract responses and never fetches the supplied URL", async () => {
    const seen: unknown[] = [];
    const api = setup(
      async (url, init) => {
        expect(new URL(url).origin).toBe("https://api.tavily.com");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer tavily-secret",
        );
        seen.push(JSON.parse(String(init?.body)));
        return String(url).endsWith("/search")
          ? reply({
              results: [
                { title: "Title", url: "https://example.com", content: "Text" },
              ],
            })
          : reply({ results: [{ raw_content: "# Markdown" }] });
      },
      { TAVILY_API_KEY: "tavily-secret" },
    );
    expect(
      await (await api.request("/search?q=hello&count=99")).json(),
    ).toEqual({
      query: "hello",
      results: [
        { title: "Title", url: "https://example.com", description: "Text" },
      ],
    });
    expect(
      await (await api.request("/extract?url=https://example.com")).json(),
    ).toEqual({ url: "https://example.com", content: "# Markdown" });
    expect(seen).toEqual([
      { query: "hello", max_results: 10, search_depth: "basic" },
      { urls: "https://example.com", format: "markdown" },
    ]);
    expect((await api.request("/extract?url=http://example.com")).status).toBe(
      400,
    );
    expect((await api.request("/search?q=%20")).status).toBe(400);
  });

  it("redacts secrets in failures and maps provider quota responses", async () => {
    const api = setup(
      async () => {
        throw new Error(
          "https://upstream.test/?apikey=private-key&token=other private-key",
        );
      },
      { TAVILY_API_KEY: "private-key" },
    );
    const response = await api.request("/search?q=test");
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("private-key");
    expect(text).not.toContain("other");
    api.context.fetch = async () => reply({}, 432);
    expect((await api.request("/search?q=test")).status).toBe(429);
  });
});

describe("restricted CORS proxy", () => {
  const allowed = "https://api.gelato.digital/1balance";
  it("checks parsed origins and path boundaries", () => {
    for (const target of [
      "https://api.gelato.digital/1balance",
      "https://api.gelato.digital/1balance/account?q=x",
    ])
      expect(allowedProxyTarget(new URL(target), allowed)).toBe(true);
    for (const target of [
      "https://api.gelato.digital.evil.test/1balance",
      "https://api.gelato.digital@evil.test/1balance",
      "https://user@api.gelato.digital/1balance",
      "http://api.gelato.digital/1balance",
      "https://api.gelato.digital/1balanceevil",
      "https://api.gelato.digital/1balance/../secret",
    ])
      expect(allowedProxyTarget(new URL(target), allowed)).toBe(false);
  });

  it("streams allowed responses without following redirects or leaking proxy headers", async () => {
    let calls = 0;
    const api = setup(async (url, init) => {
      calls++;
      expect(String(url)).toBe("https://api.gelato.digital/1balance?q=x");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("host")).toBeNull();
      expect(new Headers(init?.headers).get("origin")).toBeNull();
      expect(await new Response(init?.body).text()).toBe("payload");
      return new Response("redirect", {
        status: 302,
        headers: {
          location: "https://evil.test",
          "access-control-allow-credentials": "true",
          "content-encoding": "gzip",
        },
      });
    });
    const response = await api.request(
      "/cors-proxy/https://api.gelato.digital/1balance?q=x",
      {
        method: "POST",
        headers: {
          host: "api.evmcrispr.com",
          origin: "https://next.evmcrispr.com",
        },
        body: "payload",
      },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(
      (await api.request("/cors-proxy/https://evil.test/1balance")).status,
    ).toBe(403);
    expect(calls).toBe(1);
  });
});
