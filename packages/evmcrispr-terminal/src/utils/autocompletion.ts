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
  stdCommands,
  stdHelpers,
} from '@1hive/evmcrispr';
import type { IRange, languages } from 'monaco-editor';

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

const DEFAULT_MODULE_BINDING: ModuleBinding = {
  type: MODULE,
  identifier: 'std',
  value: { commands: stdCommands, helpers: stdHelpers },
};

export const runLoadCommands = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  eagerBindingsManager.setBinding(
    'std',
    { commands: stdCommands, helpers: stdHelpers },
    BindingsSpace.MODULE,
  );
  eagerBindingsManager.setBinding('std', 'std', BindingsSpace.ALIAS);
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
): ICommand | undefined => {
  const moduleName = c.module ?? DEFAULT_MODULE_BINDING.identifier;
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
  const executedCommands = new Set<string>();

  // Prepare all eager run functions
  const commandEagerExecutionFns = [...commandNodes]
    /**
     * Reverse the command list in order to keep track of
     * the first executed command of every type
     */
    .reverse()
    .map((c) => {
      const commandFullName = `${c.module}:${c.name}`;

      const command = resolveCommandNode(c, eagerBindingsManager);

      if (!command) {
        return;
      }

      const isClosestCommandToCaret = !executedCommands.has(commandFullName);
      const eagerFn = command.runEagerExecution(
        c,
        ...eagerFnParams,
        isClosestCommandToCaret,
      );

      executedCommands.add(commandFullName);

      return eagerFn;
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
    .forEach((resolveLazyBinding) => resolveLazyBinding(eagerBindingsManager));
};

export const buildModuleCompletionItems = async (
  bindingsManager: BindingsManager,
  range: /* IRange */ any,
): Promise<{
  commandCompletionItems: CompletionItem[];
  helperCompletionItems: CompletionItem[];
}> => {
  const moduleBindings = bindingsManager.getAllBindings({
    spaceFilters: [BindingsSpace.MODULE],
  }) as ModuleBinding[];

  const moduleAliases = moduleBindings.map(
    ({ identifier }) =>
      bindingsManager.getBindingValue(identifier, BindingsSpace.ALIAS) ??
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
                moduleAlias === DEFAULT_MODULE_BINDING.identifier
                  ? ''
                  : `${moduleAlias}:`
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
          kind: 9,
          sortText: '3',
          range,
        }));
    }),
  };
};

export const buildVarCompletionItems = (
  bindings: BindingsManager,
  range: IRange,
  currentCommandNode: CommandExpressionNode,
  currentPos: Position,
): CompletionItem[] => {
  const currentArgIndex = calculateCurrentArgIndex(
    currentCommandNode,
    currentPos,
  );
  let varNames = bindings.getAllBindingIdentifiers({ spaceFilters: [USER] });

  if (currentCommandNode.name === 'set') {
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
    (name): languages.CompletionItem => ({
      label: name,
      insertText: name,
      kind: 4,
      sortText: '2',
      range,
    }),
  );
};
