import { ComparisonType, checkArgsLength } from '../../../utils';
import type {
  AsExpressionNode,
  Commands,
  HelperFunctions,
  ICommand,
  ModuleExports,
} from '../../../types';
import { NodeType } from '../../../types';
import { AragonOS } from '../../aragonos/AragonOS';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';
import type { Binding } from '../../../BindingsManager';
import { BindingsSpace } from '../../../BindingsManager';

const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

const addPrefixToCommands = (commands: Commands, prefix: string): Commands => {
  return Object.keys(commands).reduce(
    (newCommands, commandName) => ({
      ...newCommands,
      [`${prefix}:${commandName}`]: commands[commandName],
    }),
    {},
  );
};

export const load: ICommand<Std> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });

    const [argNode] = c.args;
    const type = argNode.type;
    const isIdentifier = type === ProbableIdentifier || type === StringLiteral;

    if (type !== AsExpression && type !== StringLiteral && !isIdentifier) {
      throw new ErrorException('invalid argument. Expected a string');
    }

    let moduleName: string,
      moduleAlias: string | undefined = undefined;

    if (argNode.type === AsExpression) {
      [moduleName, moduleAlias] = await interpretNode(argNode, {
        treatAsLiteral: true,
      });
    } else {
      moduleName = await interpretNode(argNode, {
        treatAsLiteral: true,
      });
    }

    if (module.modules.find((m: any) => m.name === moduleName)) {
      throw new ErrorException(`module ${moduleName} already loaded`);
    }

    if (moduleAlias) {
      const m = module.modules.find((m: any) => m.alias === moduleAlias);

      if (m) {
        throw new ErrorException(`alias already used for module ${m.name}`);
      }
    }

    switch (moduleName) {
      case 'aragonos':
        module.modules.push(
          new AragonOS(
            module.bindingsManager,
            module.nonces,
            await module.signer.getChainId(),
            module.signer,
            module.ipfsResolver,
            moduleAlias,
          ),
        );
        return;
      default:
        throw new ErrorException(`module ${moduleName} not found`);
    }
  },
  async runEagerExecution(nodeArgs, cache) {
    const moduleNameArg = nodeArgs[0];
    let moduleName: string,
      moduleAlias = '';

    if (moduleNameArg.type === AsExpression) {
      const asNode = moduleNameArg as AsExpressionNode;
      moduleName = asNode.left.value;
      moduleAlias = asNode.right.value;
    } else {
      moduleName = moduleNameArg.value;
    }

    const binding: Binding = {
      identifier: moduleName,
      type: BindingsSpace.MODULE,
      value: '',
    };

    const module = cache.getBinding(moduleName, BindingsSpace.MODULE) as {
      commands: Commands;
      helpers: HelperFunctions;
    };
    const commandPrefix = moduleAlias ?? moduleName;

    if (module) {
      const newCommands = addPrefixToCommands(module.commands, commandPrefix);
      // TODO: Add prefixes to helpers when we support them in parsers
      binding.value = { commands: newCommands, helpers: module.helpers };
      return binding;
    }

    try {
      const { commands, helpers } = (await import(
        /* @vite-ignore */
        `../../${moduleName}`
      )) as ModuleExports;

      const newCommands = addPrefixToCommands(commands, commandPrefix);

      // TODO: Add prefixes to helpers when we support them in parsers
      binding.value = { commands: newCommands, helpers };
      return binding;
    } catch (err) {
      console.error(err);
      return;
    }
  },
};
