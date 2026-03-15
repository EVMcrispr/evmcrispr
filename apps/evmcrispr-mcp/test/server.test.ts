import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllModules } from "evmcrispr/lib/modules";
import { createMcpServer } from "../src/server.js";

describe("MCP server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    registerAllModules();

    const server = createMcpServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await cleanup?.();
  });

  describe("tools/list", () => {
    it("lists all six tools", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "evmcrispr_create_link",
        "evmcrispr_get_completions",
        "evmcrispr_get_hover_info",
        "evmcrispr_get_signature_help",
        "evmcrispr_simulate_evml",
        "evmcrispr_validate_evml",
      ]);
    });

    it("has descriptions for every tool", async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
      }
    });
  });

  describe("evmcrispr_validate_evml tool", () => {
    it("validates a correct script", async () => {
      const result = await client.callTool({
        name: "evmcrispr_validate_evml",
        arguments: { script: "set $x 42" },
      });
      const parsed = JSON.parse(
        (result.content as { type: string; text: string }[])[0].text,
      );
      expect(parsed.valid).toBe(true);
      expect(parsed.diagnostics).toEqual([]);
    });

    it("reports errors for invalid script", async () => {
      const result = await client.callTool({
        name: "evmcrispr_validate_evml",
        arguments: { script: "unknown_cmd foo" },
      });
      const parsed = JSON.parse(
        (result.content as { type: string; text: string }[])[0].text,
      );
      expect(parsed.valid).toBe(false);
      expect(parsed.diagnostics.length).toBeGreaterThan(0);
    });
  });

  describe("resources/list", () => {
    it("lists the full-docs fixed resource", async () => {
      const { resources } = await client.listResources();
      const names = resources.map((r) => r.name);
      expect(names).toContain("full-docs");
    });

    it("lists resource templates", async () => {
      const { resourceTemplates } = await client.listResourceTemplates();
      const uris = resourceTemplates.map((t) => t.uriTemplate);
      expect(uris).toContain("evmcrispr://docs/module/{name}");
      expect(uris).toContain("evmcrispr://docs/command/{module}/{name}");
      expect(uris).toContain("evmcrispr://docs/helper/{module}/{name}");
    });
  });

  describe("prompts/list", () => {
    it("lists write_evml and debug_evml prompts", async () => {
      const { prompts } = await client.listPrompts();
      const names = prompts.map((p) => p.name).sort();
      expect(names).toEqual(["debug_evml", "write_evml"]);
    });
  });
});
