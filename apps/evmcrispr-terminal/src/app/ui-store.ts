import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { resolveInitialViewMode } from "../utils/view-mode";

/** What a new space holds. Its first comment is its title, so it starts
 *  with one that says it has none yet. */
export const SCRIPT_PLACEHOLDER = `# Untitled

## Example: deposit 1 ETH into WETH
# switch mainnet
# exec @token(WETH) deposit() --value 1e18
`;

/** An explicit request (hover-link click or tap) to open a command/helper's
 *  docs in the reference panel. `ts` is a nonce so re-requesting the same
 *  entry still fires the panel-open effect. */
export type DocsRequest = {
  name: string;
  kind: "command" | "helper";
  module?: string;
  ts: number;
};

export type ViewMode = "edit" | "view";
export type PanelTab = "console" | "library" | "reference" | "chat";

/** View state only. Nothing here is data: the script, the list of spaces
 *  and the runs live elsewhere and are read through hooks. */
export interface UiState {
  activeTab: PanelTab;
  viewMode: ViewMode;
  docsRequest: DocsRequest | null;
  /** Until stage 2 moves runs out of React. */
  isLoading: boolean;
  executingLine: number | null;
}

export const uiStore = createStore<UiState>(() => ({
  activeTab: "library",
  viewMode: resolveInitialViewMode(),
  docsRequest: null,
  isLoading: false,
  executingLine: null,
}));

export const useUi = <T>(selector: (state: UiState) => T): T =>
  useStore(uiStore, selector);
export const setUi = (patch: Partial<UiState>) => uiStore.setState(patch);
