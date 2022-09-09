import { ComparisonType, checkArgsLength } from '../../../utils';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { AragonOS } from '../../aragonos/AragonOS';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';

const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

export const load: CommandFunction<Std> = async (
  module,
  c,
  { interpretNode },
) => {
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
};
