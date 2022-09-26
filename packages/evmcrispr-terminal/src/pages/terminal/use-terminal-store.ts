import type { Module } from '@1hive/evmcrispr';
import { stdCommands, stdHelpers } from '@1hive/evmcrispr';
import { createStore } from '@udecode/zustood';

const scriptPlaceholder = `# Available commands:
# Standard commands:
# exec <contractAddress> <methodNameOrSignature> [...params]
# load <module> [as <alias>]
# set $<varName> <value>
# switch <chainId>
# AragonOS commands
# act <agent> <targetAddr> <methodSignature> [...params]
# connect <dao> [...path] [--context https://yoursite.com] (
#   <...commands>
# )
# forward <...path> (
#  <...commands>
# )
# grant <entity> <app> <role> [permissionManager] [--oracle <entity>]
# install <repo> [...initParams] [--version <version>]
# new-dao <daoName>
# new-token <name> <symbol> <controllerAddress> [decimals = 18] [transferable = true]
# revoke <entity> <app> <role>
# upgrade <appRepoName> [version = latest]

# Example (unwrap wxDAI):
# load aragonos as ar
# 
# ar:connect 1hive token-manager voting (
#   install agent:new
#   grant voting agent:new TRANSFER_ROLE voting
#   exec vault transfer @token(WXDAI) agent:new 100e18
#   act agent:new @token(WXDAI) withdraw(uint256) 100e18
#   exec agent:new transfer XDAI vault 100e18
# )
`;

export type ModuleData = {
  commands: string[];
  helpers: string[];
};

type TerminalStoreState = {
  modules: Record<string, ModuleData>;
  script: string;
  errors: string[];
  isLoading: boolean;
};

const initialState: TerminalStoreState = {
  modules: {
    std: {
      commands: Object.keys(stdCommands),
      helpers: Object.keys(stdHelpers),
    },
  },
  script: scriptPlaceholder,
  errors: [],
  isLoading: false,
};

const terminalStore = createStore('terminal-store')(initialState, {
  persist: {
    enabled: true,
    partialize: (state) => ({ ...initialState, script: state.script }),
  },
  devtools: { enabled: process.env.NODE_ENV === 'development' },
}).extendActions((set) => ({
  addModules: (modules: Module[]) => {
    set.state((draft) => {
      modules.forEach(({ name, commands, helpers }) => {
        draft.modules[name] = {
          commands: Object.keys(commands),
          helpers: Object.keys(helpers),
        };
      });
    });
  },
}));

export const useTerminalStore = terminalStore.useStore;
export const terminalStoreSelectors = terminalStore.use;
export const terminalStoreActions = terminalStore.set;
