import { ErrorException } from '../../errors';
import type {
  AsExpressionNode,
  Commands,
  HelperFunctions,
  ICommand,
} from '../../types';
import { BindingsSpace, NodeType } from '../../types';
import { ComparisonType, checkArgsLength, insideNode } from '../../utils';
import type { Std } from '../Std';

const { ALIAS, MODULE } = BindingsSpace;
const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

function buildModulePackageName(name: string): string {
  const name_ = name.toLowerCase();

  return `@1hive/evmcrispr-${name_}-module`;
}

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
    try {
      const { ModuleConstructor } = await import(
        buildModulePackageName(moduleName)
      );
      module.modules.push(
        new ModuleConstructor(
          module.bindingsManager,
          module.nonces,
          module.evmcrispr,
          module.ipfsResolver,
          moduleAlias,
        ),
      );
    } catch (e) {
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
        return ['aragonos', 'tenderly', 'giveth'];
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

      try {
        const { commands: moduleCommands, helpers: moduleHelpers } =
          await import(buildModulePackageName(moduleName));
        commands = moduleCommands as Commands;
        helpers = moduleHelpers as HelperFunctions;
      } catch (e) {
        throw new ErrorException(`Module ${moduleName} not found.`);
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
