import { createStore } from "zustand-x";
import { resolveInitialViewMode } from "../utils/view-mode";

export const SCRIPT_PLACEHOLDER = `## Example: deposit 1 ETH into WETH

# switch mainnet
# exec @token(WETH) deposit() --value 1e18
`;

/** An explicit request (hover-link click or tap) to open a command/helper's
 *  docs in the reference panel. `ts` is a nonce so re-requesting the same
 *  entry (e.g. clicking the link again after navigating away) still fires
 *  the panel-open effect. */
export type DocsRequest = {
  name: string;
  kind: "command" | "helper";
  module?: string;
  ts: number;
};

export type ViewMode = "edit" | "view";

export type TerminalStoreState = {
  currentScriptId: string | null;
  title: string;
  script: string;
  isLoading: boolean;
  isSaving: boolean;
  activeTab: "console" | "library" | "reference" | "chat";
  executingLine: number | null;
  docsRequest: DocsRequest | null;
  viewMode: ViewMode;
};

const initialState: TerminalStoreState = {
  currentScriptId: null,
  title: "",
  script: SCRIPT_PLACEHOLDER,
  isLoading: false,
  isSaving: false,
  activeTab: "library",
  executingLine: null,
  docsRequest: null,
  viewMode: resolveInitialViewMode(),
};

const terminalStore = createStore<TerminalStoreState>(initialState, {
  name: "terminal-store",
  devtools: { enabled: process.env.NODE_ENV === "development" },
});

export const useTerminalStore = terminalStore.useStore;
export const terminalStoreActions = terminalStore.set;
export const terminalStoreGet = terminalStore.get;
