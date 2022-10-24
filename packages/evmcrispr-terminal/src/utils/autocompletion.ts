import type {
  BindingsManager,
  CommandExpressionNode,
  ICommand,
  LazyBindings,
  ModuleBinding,
  ModuleData,
  Position,
} from '@1hive/evmcrispr';
import {
  BindingsSpace,
  calculateCurrentArgIndex,
  hasCommandsBlock,
  stdCommands,
  stdHelpers,
} from '@1hive/evmcrispr';
import { utils } from 'ethers';
import type { IRange } from 'monaco-editor';
import { languages } from 'monaco-editor';

import { shortenAddress } from './web3';

const { Field, Property, Variable } = languages.CompletionItemKind;
type CompletionItem = languages.CompletionItem;
type AllEagerExecParams = Parameters<Required<ICommand>['runEagerExecution']>;
type EagerExecParams = [
  AllEagerExecParams[1],
  AllEagerExecParams[2],
  AllEagerExecParams[3],
];

export type ModulesRegistry = Record<
  string,
  { data: ModuleData; alias: string }
>;

const { MODULE, USER } = BindingsSpace;

export const DEFAULT_MODULE_BINDING: ModuleBinding = {
  type: MODULE,
  identifier: 'std',
  value: { commands: stdCommands, helpers: stdHelpers },
};

export const runLoadCommands = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  eagerBindingsManager.setBindings(DEFAULT_MODULE_BINDING);

  const loadCommandNodes = commandNodes.filter((c) => c.name === 'load');

  await runEagerExecutions(
    loadCommandNodes,
    eagerBindingsManager,
    ...eagerFnParams,
  );
};

export const resolveCommandNode = (
  c: CommandExpressionNode,
  eagerBindingsManager: BindingsManager,
  parentModule: string,
): ICommand | undefined => {
  const moduleName =
    c.module ?? parentModule ?? DEFAULT_MODULE_BINDING.identifier;

  const resolvedModuleName =
    eagerBindingsManager.getBindingValue(moduleName, BindingsSpace.ALIAS) ??
    moduleName;

  const module = eagerBindingsManager.getBindingValue(
    resolvedModuleName,
    BindingsSpace.MODULE,
  );

  if (!module) {
    return;
  }

  return module.commands[c.name];
};

export const runEagerExecutions = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  let parentCommandModule = DEFAULT_MODULE_BINDING.identifier;
  /**
   * Keep track of commands' modules across nested command blocks
   */
  const commandToModule = commandNodes.reduce<string[]>(
    (commandToModule, c) => {
      if (hasCommandsBlock(c)) {
        parentCommandModule = c.module ?? parentCommandModule;
      }
      commandToModule.push(c.module ?? parentCommandModule);
      return commandToModule;
    },
    [],
  );

  const executedCommands = new Set<string>();
  // Prepare all eager run functions
  const commandEagerExecutionFns = [...commandNodes]
    /**
     * Reverse the command list in order to keep track of
     * the first executed command of every type
     */
    .reverse()
    .map((c, index) => {
      const commandModule = commandToModule[commandToModule.length - 1 - index];
      const commandFullName = `${commandModule}:${c.name}`;

      const command = resolveCommandNode(
        c,
        eagerBindingsManager,
        commandModule,
      );

      if (!command) {
        return;
      }

      const isClosestCommandToCaret = !executedCommands.has(commandFullName);

      try {
        const eagerFn = command.runEagerExecution(
          c,
          ...eagerFnParams,
          isClosestCommandToCaret,
        );
        executedCommands.add(commandFullName);

        return eagerFn;
        // eslint-disable-next-line no-empty
      } catch (err) {}
    });

  // Execute them all at once
  const lazyBindingResolvers = (
    await Promise.all(commandEagerExecutionFns)
  ).filter<LazyBindings>((b): b is LazyBindings => !!b);

  // Populate the eager bindings manager by resolving the lazy bindings
  lazyBindingResolvers
    /**
     * Reverse back the lazy binding resolvers so we execute them
     * in the the order the original commands were given
     */
    .reverse()
    .forEach((resolveLazyBinding) => {
      try {
        resolveLazyBinding(eagerBindingsManager);
        // eslint-disable-next-line no-empty
      } catch (err) {}
    });
};

export const buildModuleCompletionItems = (
  eagerBindingsManager: BindingsManager,
  range: IRange,
): {
  commandCompletionItems: CompletionItem[];
  helperCompletionItems: CompletionItem[];
} => {
  const scopeModule =
    eagerBindingsManager.getScopeModule() ?? DEFAULT_MODULE_BINDING.identifier;

  const moduleBindings = eagerBindingsManager.getAllBindings({
    spaceFilters: [BindingsSpace.MODULE],
  }) as ModuleBinding[];

  const moduleAliases = moduleBindings.map(
    ({ identifier }) =>
      eagerBindingsManager.getBindingValue(identifier, BindingsSpace.ALIAS) ??
      identifier,
  );

  return {
    commandCompletionItems: moduleBindings.flatMap(
      ({ value: module }, index) => {
        const moduleAlias = moduleAliases[index];
        return Object.keys(module.commands)
          .map(
            (commandName) =>
              `${
                scopeModule === moduleAlias ? '' : `${moduleAlias}:`
              }${commandName}`,
          )
          .map((name) => ({
            label: name,
            insertText: name,
            kind: 1,
            range,
          }));
      },
    ),

    // TODO: add prefixes to helpers after it's supported on parsers
    helperCompletionItems: moduleBindings.flatMap(({ value: module }) => {
      return Object.keys(module.helpers)
        .map((helperName) => `@${helperName}`)
        .map((name) => ({
          label: name,
          insertText: `${name}()`,
          kind: Property,
          sortText: '3',
          range,
        }));
    }),
  };
};

export const buildVarCompletionItems = (
  eagerBindingsManager: BindingsManager,
  range: IRange,
  currentPos: Position,
  currentCommandNode?: CommandExpressionNode,
): CompletionItem[] => {
  let varNames = eagerBindingsManager.getAllBindingIdentifiers({
    spaceFilters: [USER],
  });

  if (currentCommandNode && currentCommandNode.name === 'set') {
    const currentArgIndex = calculateCurrentArgIndex(
      currentCommandNode,
      currentPos,
    );
    // Don't return suggestions for a variable declaration
    if (currentArgIndex === 0) {
      return [];
      // Don't return the current declared variable as a suggestion
    } else if (currentArgIndex === 1) {
      const currentVarName = currentCommandNode.args[0].value;
      varNames = varNames.filter((varName) => varName !== currentVarName);
    }
  }

  return varNames.map(
    (name): CompletionItem => ({
      label: name,
      insertText: name,
      kind: Variable,
      sortText: '2',
      range,
    }),
  );
};

export const buildCurrentArgCompletionItems = (
  eagerBindingsManager: BindingsManager,
  currentCommandNode: CommandExpressionNode,
  parentModule: string,
  range: IRange,
  currentPos: Position,
): CompletionItem[] => {
  let currentArgCompletionItems: languages.CompletionItem[] = [];

  const lastCommand = resolveCommandNode(
    currentCommandNode,
    eagerBindingsManager,
    parentModule,
  );

  if (lastCommand) {
    currentArgCompletionItems = lastCommand
      .buildCompletionItemsForArg(
        calculateCurrentArgIndex(currentCommandNode, currentPos),
        currentCommandNode.args,
        eagerBindingsManager,
        currentPos,
      )
      .map<languages.CompletionItem>((identifier) => ({
        label: utils.isAddress(identifier)
          ? shortenAddress(identifier)
          : identifier,
        insertText: identifier,
        range,
        sortText: '1',
        kind: Field,
      }));
  }

  return currentArgCompletionItems;
};
