import { createStore } from "zustand-x";

const scriptPlaceholder = `## Basic commands:

# exec <contractAddress> <methodNameOrSignature> [...params] [--value <value>]
# load <module> [as <alias>]
# set $<varName> <value>
# switch <chainId>


## Example (unwrap wxDAI):

# load aragonos as ar
# ar:connect 1hive token-manager voting (
#   install agent:new
#   grant voting agent:new TRANSFER_ROLE voting
#   exec vault transfer @token(WXDAI) agent:new 100e18
#   act agent:new @token(WXDAI) withdraw(uint256) 100e18
#   exec agent:new transfer XDAI vault 100e18
# )
`;

export type TerminalStoreState = {
  title: string;
  script: string;
  errors: string[];
  isLoading: boolean;
};

const initialState: TerminalStoreState = {
  title: "",
  script: scriptPlaceholder,
  errors: [],
  isLoading: false,
};

const terminalStore = createStore<TerminalStoreState>(initialState, {
  name: "terminal-store",
  persist: {
    enabled: true,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    partialize: (state) => ({
      title: state.title,
      script: state.script,
    }),
  },
  devtools: { enabled: process.env.NODE_ENV === "development" },
});

export const useTerminalStore = terminalStore.useStore;
export const terminalStoreActions = terminalStore.set;
