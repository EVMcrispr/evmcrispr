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
export type PanelTab = "space" | "agents" | "reference";

/** What a run reads as stdin. */
export interface ScriptInputValue {
  name: string;
  text: string;
  /** Set when the input came from the `stdin` link parameter, not a file. */
  source?: "url";
}

/** View state only. Nothing here is data: the script, the list of spaces
 *  and the runs live elsewhere and are read through hooks. */
export interface UiState {
  activeTab: PanelTab;
  /** The Space tab's two views. */
  spaceView: "list" | "timeline";
  /** A revision shown in the main area without loading it. */
  previewRevisionId: string | null;
  viewMode: ViewMode;
  docsRequest: DocsRequest | null;
  /** What the user chose as each space's stdin (not saved), with the
   *  address's own stdin it replaced: a new one in the address wins. */
  stdin: Record<
    string,
    { urlInput: string | undefined; value: ScriptInputValue | undefined }
  >;
}

export const uiStore = createStore<UiState>(() => ({
  activeTab: "space",
  spaceView: "timeline",
  previewRevisionId: null,
  viewMode: resolveInitialViewMode(),
  docsRequest: null,
  stdin: {},
}));

export const useUi = <T>(selector: (state: UiState) => T): T =>
  useStore(uiStore, selector);
export const setUi = (patch: Partial<UiState>) => uiStore.setState(patch);
