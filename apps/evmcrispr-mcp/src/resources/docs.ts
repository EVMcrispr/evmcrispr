import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadCommandDocs,
  loadFullDocs,
  loadHelperDocs,
  loadModuleDocs,
} from "evmcrispr/lib/docs-loader";

export function registerDocResources(server: McpServer): void {
  // Full concatenated docs
  server.registerResource(
    "full-docs",
    "evmcrispr://docs/full",
    {
      title: "EVMcrispr Full Documentation",
      description: "Complete EVMcrispr reference documentation",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: await loadFullDocs(),
        },
      ],
    }),
  );

  // Per-module docs
  server.registerResource(
    "module-docs",
    new ResourceTemplate("evmcrispr://docs/module/{name}", { list: undefined }),
    {
      title: "Module Documentation",
      description: "Documentation for a specific EVMcrispr module",
    },
    async (uri, variables) => {
      const name = variables.name as string;
      const content = await loadModuleDocs(name);
      if (!content) {
        throw new Error(`No docs found for module: ${name}`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: content,
          },
        ],
      };
    },
  );

  // Per-command docs
  server.registerResource(
    "command-docs",
    new ResourceTemplate("evmcrispr://docs/command/{module}/{name}", {
      list: undefined,
    }),
    {
      title: "Command Documentation",
      description: "Documentation for a specific EVMcrispr command",
    },
    async (uri, variables) => {
      const moduleName = variables.module as string;
      const commandName = variables.name as string;
      const content = await loadCommandDocs(moduleName, commandName);
      if (!content) {
        throw new Error(
          `No docs found for command: ${moduleName}:${commandName}`,
        );
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: content,
          },
        ],
      };
    },
  );

  // Per-helper docs
  server.registerResource(
    "helper-docs",
    new ResourceTemplate("evmcrispr://docs/helper/{module}/{name}", {
      list: undefined,
    }),
    {
      title: "Helper Documentation",
      description: "Documentation for a specific EVMcrispr helper function",
    },
    async (uri, variables) => {
      const moduleName = variables.module as string;
      const helperName = variables.name as string;
      const content = await loadHelperDocs(moduleName, helperName);
      if (!content) {
        throw new Error(
          `No docs found for helper: ${moduleName}:${helperName}`,
        );
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: content,
          },
        ],
      };
    },
  );
}
