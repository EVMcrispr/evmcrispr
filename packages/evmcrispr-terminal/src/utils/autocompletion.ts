import type {
  AsExpressionNode,
  Cas11ASTCommand,
  Module,
} from '@1hive/evmcrispr';
import { Cas11AST, EVMcrispr, NodeType } from '@1hive/evmcrispr';
import type { Signer } from 'ethers';
import type { IRange, languages } from 'monaco-editor';

import type { ModuleData } from '../pages/terminal/use-terminal-store';

const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

type CompletionItem = languages.CompletionItem;
type ModuleCompletionData = {
  prefix: string;
  commands: string[];
  helpers: string[];
};

export const buildModuleCompletionItems = async (
  astCommands: Cas11ASTCommand[],
  moduleCache: Record<string, ModuleData>,
  signer: Signer,
  range: IRange,
  updateCache: (modules: Module[]) => void,
): Promise<{
  commandCompletionItems: CompletionItem[];
  helperCompletionItems: CompletionItem[];
}> => {
  const loadCommands = astCommands.filter(
    (c) =>
      c.node.name === 'load' &&
      [ProbableIdentifier, StringLiteral, AsExpression].includes(
        c.node.args[0].type,
      ),
  );
  const moduleNames: { name: string; alias?: string }[] = [
    { name: 'std', alias: '' },
    ...loadCommands.map((c) => {
      const moduleNameArg = c.node.args[0];

      if (moduleNameArg.type === AsExpression) {
        const asNode = moduleNameArg as AsExpressionNode;
        return { name: asNode.left.value, alias: asNode.right.value };
      } else {
        return { name: moduleNameArg.value };
      }
    }),
  ];

  const unresolvedLoadNodes = moduleNames
    .filter((n) => !moduleCache[n.name])
    .map((_, i) => loadCommands[i].node);

  let modulesData: ModuleCompletionData[] = moduleNames
    .filter((n) => moduleCache[n.name])
    .map((n) => {
      const { commands, helpers } = moduleCache[n.name];
      return {
        prefix: n.alias ?? n.name,
        commands,
        helpers,
      };
    });

  if (unresolvedLoadNodes.length) {
    try {
      const interpreter: EVMcrispr = new EVMcrispr(
        new Cas11AST(unresolvedLoadNodes),
        signer,
      );

      await interpreter.interpret();

      const allModules = interpreter.getAllModules();
      const newModulesData = allModules.map(
        (m, i): ModuleCompletionData => ({
          prefix: allModules[i].contextualName,
          commands: Object.keys(m.commands),
          helpers: Object.keys(m.helpers),
        }),
      );

      modulesData = [...modulesData, ...newModulesData];

      updateCache(allModules);
      // eslint-disable-next-line no-empty
    } catch (err) {}
  }

  const commandCompletionItems: CompletionItem[] = modulesData
    .flatMap(({ prefix, commands }) =>
      commands.map(
        (commandName) => `${prefix ? `${prefix}:` : ''}${commandName}`,
      ),
    )
    .map((name) => ({
      label: name,
      insertText: name,
      kind: 1,
      range,
    }));
  const helperCompletionItems: CompletionItem[] = modulesData
    .flatMap(({ helpers }) => helpers)
    .map((name) => `@${name}`)
    .map((name) => ({
      label: name,
      insertText: `${name}()`,
      kind: 9,
      range,
    }));

  return { commandCompletionItems, helperCompletionItems };
};

export const buildVarCompletionItems = (
  commands: Cas11ASTCommand[],
  range: IRange,
): languages.CompletionItem[] => {
  const setCommands = commands.filter((c) => c.node.name === 'set');

  const varNames = setCommands.map(
    ({ node: { args } }): languages.CompletionItem => ({
      label: args[0].value,
      insertText: args[0].value,
      kind: 4,
      range,
    }),
  );

  return varNames;
};
