// ── Nexus config & client ──

export type { ChatMeta, StoredChat } from "./chat-store";
export {
  createChatStore,
  deriveTitle,
  getChat,
  listChats,
  removeChat,
  saveChat,
} from "./chat-store";
export type { NexusConfig } from "./config";
export { DEFAULT_NEXUS_CONFIG, resolveNexusConfig } from "./config";
// ── "Login with Dappnode Nexus" (PKCE) ──
export type { NexusAuthOptions } from "./nexus-auth";
export {
  createNexusAuth,
  fetchNexusBalance,
  loginWithNexus,
  logoutNexus,
  relayNexusCallback,
} from "./nexus-auth";
// ── Cross-origin auth broker ──
export type {
  NexusBrokerClientOptions,
  NexusBrokerOptions,
} from "./nexus-broker";
export { initNexusBroker, NexusBrokerClient } from "./nexus-broker";
export { createNexusModel } from "./nexus-client";
// ── Prompt helpers ──
export { nowLine, nowStamp, withClock } from "./prompt";
// ── Persistence ──
export type { ChatStorage, NexusAuth } from "./storage";
export { createLocalStorageChatStorage } from "./storage";
// ── Tool factories ──
export { createContractTools } from "./tools/contract-tools";
export { createDocTools } from "./tools/doc-tools";
export {
  getModuleOverview,
  loadCommandDocs,
  loadHelperDocs,
  loadModuleDocs,
  MODULES,
} from "./tools/docs";
export type {
  ScriptEditResult,
  ScriptToolsHost,
} from "./tools/script-tools";
export { createScriptTools } from "./tools/script-tools";
export { createWebTools, PAGE_CHAR_BUDGET, truncate } from "./tools/web-tools";
// ── Agent hook (headless) ──
export type { ChatItem, ChatToolArtifact } from "./types";
export type { UseChatAgentOptions } from "./useChatAgent";
export { useChatAgent } from "./useChatAgent";
