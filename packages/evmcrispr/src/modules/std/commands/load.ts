import { ComparisonType, checkArgsLength } from '../../../utils';
import type {
  AliasBinding,
  AsExpressionNode,
  ICommand,
  ModuleBinding,
  ModuleExports,
} from '../../../types';
import { BindingsSpace, NodeType } from '../../../types';
import { AragonOS } from '../../aragonos/AragonOS';
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
    const aliasBinding: AliasBinding | undefined = moduleAlias
      ? {
          type: ALIAS,
          identifier: moduleAlias,
          value: moduleName,
        }
      : undefined;

    const moduleBinding = cache.getBinding(moduleName, MODULE);

    if (moduleBinding) {
      return aliasBinding ? [aliasBinding, moduleBinding] : moduleBinding;
    }

    try {
      console.log('LOAD MODULES');
      const { commands, helpers } = (await import(
        /* @vite-ignore */
        `../../${moduleName}`
      )) as ModuleExports;

      const newModuleBinding: ModuleBinding = {
        type: MODULE,
        identifier: moduleName,
        value: {
          commands,
          helpers,
        },
      };

      return aliasBinding ? [aliasBinding, newModuleBinding] : newModuleBinding;
    } catch (err) {
      return;
    }
  },
};
