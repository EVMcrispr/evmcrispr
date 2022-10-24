import type {
  AsExpressionNode,
  Cas11AST,
  CommandExpressionNode,
  IPFSResolver,
  Position,
} from '@1hive/evmcrispr';
import { BindingsManager, NodeType, parseScript } from '@1hive/evmcrispr';
import { createStore } from '@udecode/zustood';
import type { providers } from 'ethers';

import { runEagerExecutions } from '../../editor/autocompletion';
import { DEFAULT_MODULE_BINDING } from '../../utils';

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

export type TerminalStoreState = {
  bindingsCache: BindingsManager;
  script: string;
  errors: string[];
  isLoading: boolean;
  currentModuleNames: { name: string; alias?: string }[];
  lastLine: number;
  currentLine: number;
  currentCommandNodes: CommandExpressionNode[];
  ast: Cas11AST | undefined;
};

const initialState: TerminalStoreState = {
  bindingsCache: new BindingsManager([DEFAULT_MODULE_BINDING]),
  script: scriptPlaceholder,
  errors: [],
  isLoading: false,
  currentModuleNames: [],
  lastLine: -1,
  currentLine: 0,
  currentCommandNodes: [],
  ast: undefined,
};

const terminalStore = createStore('terminal-store')(initialState, {
  persist: {
    enabled: true,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    partialize: (state) => ({
      script: state.script,
    }),
  },
  devtools: { enabled: process.env.NODE_ENV === 'development' },
})
  .extendActions((set, get) => ({
    updateCurrentModules: async (loadCommandNodes: CommandExpressionNode[]) => {
      const bindingsCache = get.bindingsCache();
      // Get name and alias of load nodes
      const newModuleNames = loadCommandNodes.map((c) => {
        const nameNode = c.args[0];
        if (nameNode.type === NodeType.AsExpression) {
          return {
            name: (nameNode as AsExpressionNode).left.value,
            alias: (nameNode as AsExpressionNode).right.value,
          };
        }

        return {
          name: nameNode.value,
        };
      });
      const fetchers = {} as {
        ipfsResolver: IPFSResolver;
        provider: providers.Provider;
      };
      const pos = {} as Position;
      const oldModules = get.currentModuleNames();

      /**
       * Check for differences between new and old modules
       * and update if necessary
       */
      if (newModuleNames.length !== oldModules.length) {
        await runEagerExecutions(
          loadCommandNodes,
          bindingsCache,
          bindingsCache,
          fetchers,
          pos,
        );

        set.currentModuleNames(newModuleNames);
      } else {
        for (const { name, alias } of newModuleNames) {
          if (!oldModules.find((m) => m.alias === alias && m.name === name)) {
            await runEagerExecutions(
              loadCommandNodes,
              bindingsCache,
              bindingsCache,
              fetchers,
              pos,
            );
            set.currentModuleNames(newModuleNames);
            return;
          }
        }
      }
    },
  }))
  .extendActions((set, get) => ({
    processScript: () => {
      const currentLine = get.currentLine();
      const lastLine = get.lastLine();
      const script = get.script();

      /**
       * Compute the AST of large scripts can get expensive.
       * Do it only when the caret's line has changed.
       */
      if (lastLine === currentLine) {
        return;
      }

      // TODO: The AST re-computation can be optimized by only
      // calculating the portion of the script above the caret line
      // and adding it to the previous AST counterpart
      const scriptLines = script.split('\n');

      const { ast } = parseScript(script);

      const commandNodes = ast.getCommandsUntilLine(scriptLines.length, [
        'load',
        'set',
      ]);
      // /**
      //  * Filter out any command with a commands block that doesn't
      //  * contain the current caret
      //  */
      // .filter((c) => {
      //   const itHasCommandsBlock = hasCommandsBlock(c);
      //   const loc = c.loc;
      //   const currentLine = targetLine;
      //   if (
      //     !itHasCommandsBlock ||
      //     (itHasCommandsBlock &&
      //       loc &&
      //       currentLine >= loc.start.line &&
      //       currentLine <= loc.end.line)
      //   ) {
      //     if (itHasCommandsBlock) {
      //       currentCommandParentModule =
      //         c.module ?? currentCommandParentModule;
      //     }
      //     return true;
      //   }

      //   return false;
      // });

      set.ast(ast);
      set.updateCurrentModules(commandNodes.filter((c) => c.name === 'load'));
    },
    updateCurrentLine(currentLine: number) {
      set.lastLine(get.currentLine());
      set.currentLine(currentLine);
    },
  }));

export const useTerminalStore = terminalStore.useStore;
export const terminalStoreSelectors = terminalStore.use;
export const terminalStoreActions = terminalStore.set;
