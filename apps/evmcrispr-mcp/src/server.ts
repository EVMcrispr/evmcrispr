import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDebugEvmlPrompt } from "./prompts/debug-evml.js";
import { registerWriteEvmlPrompt } from "./prompts/write-evml.js";
import { registerDocResources } from "./resources/docs.js";
import { registerCreateLink } from "./tools/create-link.js";
import { registerGetCompletions } from "./tools/get-completions.js";
import { registerGetHoverInfo } from "./tools/get-hover-info.js";
import { registerGetSignatureHelp } from "./tools/get-signature-help.js";
import { registerSimulateEvml } from "./tools/simulate-evml.js";
import { registerValidateEvml } from "./tools/validate-evml.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "evmcrispr",
    version: "0.1.0",
  });

  // Tools
  registerSimulateEvml(server);
  registerValidateEvml(server);
  registerGetCompletions(server);
  registerGetHoverInfo(server);
  registerGetSignatureHelp(server);
  registerCreateLink(server);

  // Resources
  registerDocResources(server);

  // Prompts
  registerWriteEvmlPrompt(server);
  registerDebugEvmlPrompt(server);

  return server;
}
