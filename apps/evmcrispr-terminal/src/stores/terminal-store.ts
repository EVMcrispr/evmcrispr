import { createStore } from "zustand-x";
import { resolveInitialViewMode } from "../utils/view-mode";

export const SCRIPT_PLACEHOLDER = `## Basic commands:

# exec <contractAddress> <methodNameOrSignature> [...params] [--value <value>]
# load <module> [as <alias>]
# set $<varName> <value>
# switch <chainId>


## Example (unwrap wxDAI):

# load aragonos --as ar
# ar:connect 1hive token-manager voting (
#   install agent:new
#   grant voting agent:new TRANSFER_ROLE voting
#   exec vault transfer @token(WXDAI) agent:new 100e18
#   act agent:new @token(WXDAI) withdraw(uint256) 100e18
#   exec agent:new transfer XDAI vault 100e18
# )
`;

export type CursorRef = {
  name: string;
  kind: "command" | "helper";
};

export type ViewMode = "edit" | "view";

export type TerminalStoreState = {
  currentScriptId: string | null;
  title: string;
  script: string;
  isLoading: boolean;
  isSaving: boolean;
  activeTab: "console" | "library" | "reference";
  executingLine: number | null;
  cursorRef: CursorRef | null;
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
  cursorRef: null,
  viewMode: resolveInitialViewMode(),
};

const terminalStore = createStore<TerminalStoreState>(initialState, {
  name: "terminal-store",
  devtools: { enabled: process.env.NODE_ENV === "development" },
});

export const useTerminalStore = terminalStore.useStore;
export const terminalStoreActions = terminalStore.set;
export const terminalStoreGet = terminalStore.get;
