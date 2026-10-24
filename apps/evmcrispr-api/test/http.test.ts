import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { registerAllModules } from "evmcrispr/lib/modules";
import { createHttpHandler } from "../src/http.js";
import { reply, setup } from "./api-utils.js";

describe("one service, two exclusive hostnames", () => {
  it("rejects every wrong host/path/method before dispatch, including preflight", async () => {
    const calls: string[] = [];
    const handler = createHttpHandler({
      api: async () => {
        calls.push("api");
        return reply({ api: true });
      },
      mcp: async () => {
        calls.push("mcp");
        return reply({ mcp: true });
      },
    });
    const routes = [
      "/health",
      "/abi/1/0x0",
      "/source/1/0x0",
      "/contract/1/0x0",
      "/tokenlist/1",
      "/ipfs/pin",
      "/etherscan",
      "/search",
      "/extract",
      "/cors-proxy/https://example.com",
      "/experimental-eez-rpc/eezL1",
    ];
    for (const method of ["GET", "POST", "OPTIONS"]) {
      for (const path of routes)
        expect(
          (
            await handler(
              new Request(`https://mcp.evmcrispr.com${path}`, { method }),
            )
          ).status,
        ).toBe(404);
      for (const path of ["/mcp", "/mcp/", "/mcp/tools"])
        expect(
          (
            await handler(
              new Request(`https://api.evmcrispr.com${path}`, { method }),
            )
          ).status,
        ).toBe(404);
      for (const host of [
        "localhost",
        "service.onrender.com",
        "mcp.evmcrispr.com.attacker.test",
      ]) {
        expect(
          (
            await handler(
              new Request(`https://${host}/mcp`, {
                method,
                headers: {
                  origin: "https://mcp.evmcrispr.com",
                  "x-forwarded-host": "mcp.evmcrispr.com",
                },
              }),
            )
          ).status,
        ).toBe(404);
      }
    }
    expect(calls).toEqual([]);
    expect(
      (await handler(new Request("https://api.evmcrispr.com/health"))).status,
    ).toBe(200);
    expect(
      (
        await handler(
          new Request("https://mcp.evmcrispr.com/mcp", { method: "POST" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handler(
          new Request("https://mcp.evmcrispr.com/mcp", { method: "OPTIONS" }),
        )
      ).status,
    ).toBe(204);
    expect(calls).toEqual(["api", "mcp"]);
  });

  it("rejects mismatched authorities and allows explicit development hostnames", async () => {
    const handler = createHttpHandler({
      apiHost: "api.localhost",
      mcpHost: "mcp.localhost",
      api: async () => reply({}),
    });
    expect(
      (
        await handler(
          new Request("http://api.localhost:3002/health", {
            headers: { host: "mcp.localhost:3002" },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handler(
          new Request("http://API.localhost:3002/health", {
            headers: { host: "api.localhost:3002" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(() =>
      createHttpHandler({
        apiHost: "same",
        mcpHost: "same",
        api: async () => reply({}),
      }),
    ).toThrow();
  });

  it("serves a real MCP handshake and tool request through /mcp", async () => {
    registerAllModules();
    const api = setup(async () => {
      throw new Error("unexpected network call");
    });
    const handler = createHttpHandler({ api: api.fetch });
    const client = new Client({ name: "http-test", version: "1" });
    const transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.evmcrispr.com/mcp"),
      {
        fetch: async (input, init) => handler(new Request(input, init)),
      },
    );
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(8);
      const result = await client.callTool({
        name: "evmcrispr_validate_evml",
        arguments: { script: "set $x 42" },
      });
      expect(
        JSON.parse((result.content as { text: string }[])[0].text).valid,
      ).toBe(true);
      expect(
        await (
          await handler(new Request("https://api.evmcrispr.com/health"))
        ).json(),
      ).toEqual({ status: "ok" });
    } finally {
      await client.close();
    }
  });
});
