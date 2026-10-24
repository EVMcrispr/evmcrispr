import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDebugEvmlPrompt } from "./prompts/debug-evml.js";
import { registerWriteEvmlPrompt } from "./prompts/write-evml.js";
import { registerDocResources } from "./resources/docs.js";
import { registerCreateLink } from "./tools/create-link.js";
import { registerDescribeModule } from "./tools/describe-module.js";
import { registerGetContract } from "./tools/get-contract.js";
import { registerGetDocs } from "./tools/get-docs.js";
import { registerListModules } from "./tools/list-modules.js";
import { registerPublishModule } from "./tools/publish-module.js";
import { registerSimulateEvml } from "./tools/simulate-evml.js";
import { registerValidateEvml } from "./tools/validate-evml.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "evmcrispr",
    version: "0.1.0",
  });

  // Tools
  registerListModules(server);
  registerDescribeModule(server);
  registerGetDocs(server);
  registerGetContract(server);
  registerSimulateEvml(server);
  registerValidateEvml(server);
  registerCreateLink(server);
  registerPublishModule(server);

  // Resources
  registerDocResources(server);

  // Prompts
  registerWriteEvmlPrompt(server);
  registerDebugEvmlPrompt(server);

  return server;
}
