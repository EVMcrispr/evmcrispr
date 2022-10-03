import type {
  AliasBinding,
  Binding,
  BindingsManager,
  CommandExpressionNode,
  ICommand,
  ModuleBinding,
  ModuleData,
} from '@1hive/evmcrispr';
import { BindingsSpace, stdCommands, stdHelpers } from '@1hive/evmcrispr';
import type { IRange, languages } from 'monaco-editor';

type CompletionItem = languages.CompletionItem;
type AllEagerExecParams = Parameters<Required<ICommand>['runEagerExecution']>;
type EagerExecParams = [
  AllEagerExecParams[1],
  AllEagerExecParams[2],
  AllEagerExecParams[3],
  AllEagerExecParams[4],
];

export type ModulesRegistry = Record<string, ModuleData>;

const { MODULE, USER } = BindingsSpace;

const DEFAULT_MODULE_BINDING: ModuleBinding = {
  type: MODULE,
  identifier: 'std',
  value: { commands: stdCommands, helpers: stdHelpers },
};

export const runLoadCommands = async (
  commandNodes: CommandExpressionNode[],
  ...eagerExecFnParams: EagerExecParams
): Promise<(AliasBinding | ModuleBinding)[]> => {
  const loadCommandNodes = commandNodes.filter((c) => c.name === 'load');
  const moduleAndAliasBindings = (await runEagerExecutions(
    loadCommandNodes,
    { [DEFAULT_MODULE_BINDING.identifier]: DEFAULT_MODULE_BINDING.value },
    ...eagerExecFnParams,
  )) as (AliasBinding | ModuleBinding)[];

  return [DEFAULT_MODULE_BINDING, ...moduleAndAliasBindings];
};

export const buildModuleRegistry = (
  moduleBindings: ModuleBinding[],
  aliasBindings: AliasBinding[],
): ModulesRegistry => {
  return aliasBindings.reduce<ModulesRegistry>(
    (prevRegistry, { identifier: aliasName, value: moduleName }) => {
      const module = moduleBindings.find(
        (b) => b.identifier === moduleName,
      )!.value;

      prevRegistry[moduleName] = module;
      prevRegistry[aliasName] = module;

      return prevRegistry;
    },
    { [DEFAULT_MODULE_BINDING.identifier]: DEFAULT_MODULE_BINDING.value },
  );
};

export const resolveCommandNode = (
  c: CommandExpressionNode,
  moduleRegistry: ModulesRegistry,
): ICommand | undefined => {
  const commandModule = c.module ?? DEFAULT_MODULE_BINDING.identifier;
  const moduleData = moduleRegistry[commandModule];

  return moduleData?.commands[c.name];
};

export const runEagerExecutions = async (
  commandNodes: CommandExpressionNode[],
  moduleRegistry: ModulesRegistry,
  ...eagerExecFnParams: EagerExecParams
): Promise<Binding[]> => {
  const commandEagerExecutionFns = commandNodes.map((c) =>
    resolveCommandNode(c, moduleRegistry)!.runEagerExecution(
      c,
      ...eagerExecFnParams,
    ),
  );
  const bindings = (await Promise.all(commandEagerExecutionFns))
    .filter((b) => !!b)
    .flatMap((bindingOrBindings) => bindingOrBindings) as Binding[];

  return bindings;
};

const getPrefix = (aliasBindings: AliasBinding[], moduleName: string): string =>
  aliasBindings.find((b) => b.value === moduleName)?.identifier ?? moduleName;

export const buildModuleCompletionItems = async (
  moduleBindings: ModuleBinding[],
  aliasBindings: AliasBinding[] = [],
  range: IRange,
): Promise<{
  commandCompletionItems: CompletionItem[];
  helperCompletionItems: CompletionItem[];
}> => {
  const modulePrefixesAndData: [string | undefined, ModuleData][] =
    moduleBindings.map((b) => [
      b.identifier === DEFAULT_MODULE_BINDING.identifier
        ? undefined
        : getPrefix(aliasBindings, b.identifier),
      b.value,
    ]);

  return {
    commandCompletionItems: modulePrefixesAndData.flatMap(([prefix, m]) =>
      Object.keys(m.commands)
        .map((name) => `${prefix ? `${prefix}:` : ''}${name}`)
        .map((name) => ({
          label: name,
          insertText: name,
          kind: 1,
          range,
        })),
    ),

    // TODO: add prefixes to helpers after it's supported on parsers
    helperCompletionItems: modulePrefixesAndData
      .flatMap(([, m]) => Object.keys(m.helpers).map((name) => `@${name}`))
      .map((name) => ({
        label: name,
        insertText: `${name}()`,
        kind: 9,
        sortText: '3',
        range,
      })),
  };
};

export const buildVarCompletionItems = (
  bindings: BindingsManager,
  range: IRange,
): CompletionItem[] => {
  const varNames = bindings
    .getAllBindingsFromSpace(USER)
    .map((b) => b.identifier);

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
