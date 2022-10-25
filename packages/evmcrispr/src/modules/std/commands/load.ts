import { ComparisonType, checkArgsLength, insideNode } from '../../../utils';
import type {
  AsExpressionNode,
  Commands,
  HelperFunctions,
  ICommand,
} from '../../../types';
import { BindingsSpace, NodeType } from '../../../types';
import { AragonOS } from '../../aragonos/AragonOS';
import {
  commands as aragonosCommands,
  helpers as aragonosHelpers,
} from '../../aragonos/';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';

const { ALIAS, MODULE } = BindingsSpace;
const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

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
  buildCompletionItemsForArg(argIndex, nodeArgs, _, caretPos) {
    switch (argIndex) {
      case 0: {
        const arg = nodeArgs[0];
        if (
          arg &&
          arg.type === AsExpression &&
          insideNode((arg as AsExpressionNode).right, caretPos)
        ) {
          return [];
        }
        return ['aragonos'];
      }
      default:
        return [];
    }
  },
  async runEagerExecution({ args }, cache, _, caretPos) {
    if (!args.length || insideNode(args[0], caretPos)) {
      return;
    }

    const moduleNameArg = args[0];
    let moduleName: string,
      moduleAlias = '';

    if (moduleNameArg.type === AsExpression) {
      const asNode = moduleNameArg as AsExpressionNode;
      moduleName = asNode.left.value;
      moduleAlias = asNode.right.value;
    } else {
      moduleName = moduleNameArg.value;
    }

    const moduleBinding = cache.getBinding(moduleName, MODULE);

    if (moduleBinding) {
      return (eagerBindingsManager) => {
        if (moduleAlias) {
          eagerBindingsManager.setBinding(moduleName, moduleAlias, ALIAS);
          eagerBindingsManager.setBinding(moduleAlias, moduleName, ALIAS);
        }
        eagerBindingsManager.setBindings(moduleBinding);
      };
    }

    try {
      let commands: Commands, helpers: HelperFunctions;

      // TODO: Replace with dynamic imports after moving aragonOS to its own package
      switch (moduleName) {
        /**
         * Import the modules statically for the moment as
         * Fleek complains about dynamic imports
         */
        case 'aragonos':
          {
            commands = aragonosCommands as Commands;
            helpers = aragonosHelpers as HelperFunctions;
          }
          break;
        default:
          return;
      }

      // Cache module
      cache.setBinding(moduleName, { commands, helpers }, MODULE);

      return (eagerBindingsManager) => {
        if (moduleAlias) {
          eagerBindingsManager.setBinding(moduleName, moduleAlias, ALIAS);
          eagerBindingsManager.setBinding(moduleAlias, moduleName, ALIAS);
        }

        eagerBindingsManager.setBinding(
          moduleName,
          { commands, helpers },
          MODULE,
        );
      };
    } catch (err) {
      return;
    }
  },
};
