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

const DEFAULT_MODULE_BINDING: ModuleBinding = {
  type: BindingsSpace.MODULE,
  identifier: 'std',
  value: { commands: stdCommands, helpers: stdHelpers },
};

export const resolveAliases = (
  commandNodes: CommandExpressionNode[],
  aliasBindings: AliasBinding[],
): CommandExpressionNode[] =>
  commandNodes.map((c) => ({
    ...c,
    module:
      aliasBindings.find((b) => b.identifier === c.module)?.value ?? c.module,
  }));

export const getModuleBindings = async (
  commandNodes: CommandExpressionNode[],
  ...eagerExecFnParams: EagerExecParams
): Promise<(ModuleBinding | AliasBinding)[]> => {
  const loadCommandNodes = commandNodes.filter((c) => c.name === 'load');
  const moduleBindings = (await runEagerExecutions(
    loadCommandNodes,
    [DEFAULT_MODULE_BINDING],
    ...eagerExecFnParams,
  )) as ModuleBinding[];

  return [DEFAULT_MODULE_BINDING, ...moduleBindings];
};

export const getCommandFromModule = (
  c: CommandExpressionNode,
  moduleBindings: ModuleBinding[],
): ICommand | undefined => {
  const commandModule = c.module ?? DEFAULT_MODULE_BINDING.identifier;
  const moduleData = moduleBindings.find(
    (b) => b.identifier === commandModule,
  )?.value;

  return moduleData?.commands[c.name];
};

export const runEagerExecutions = async (
  commandNodes: CommandExpressionNode[],
  moduleBindings: ModuleBinding[],
  ...eagerExecFnParams: EagerExecParams
): Promise<Binding[]> => {
  const commandEagerExecutionFns = commandNodes.map((c) =>
    getCommandFromModule(c, moduleBindings)!.runEagerExecution(
      c.args,
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
  range: IRange,
  aliasBindings: AliasBinding[] = [],
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
    .getAllBindingsFromSpace(BindingsSpace.USER)
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
