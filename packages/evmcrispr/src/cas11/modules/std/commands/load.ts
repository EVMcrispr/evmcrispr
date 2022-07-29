// import type { CommandFunction } from '../../../types';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { AragonOS } from '../../aragonos/AragonOS';
import type { Std } from '../Std';
// import type { Std } from '../Std';

const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

const errorPrefix = 'Load command error';

export const load: CommandFunction<Std> = async (std, lazyNodes) => {
  if (lazyNodes.length !== 1) {
    throw new Error(`${errorPrefix}: invalid number of arguments. Expected 1`);
  }

  const [lazyNode] = lazyNodes;
  const type = lazyNode.type;
  const isIdentifier = type === ProbableIdentifier || type === StringLiteral;

  if (type !== AsExpression && type !== StringLiteral && !isIdentifier) {
    throw new Error(
      `Load command error: invalid argument. Expected a string or an as expression`,
    );
  }

  let moduleName: string,
    moduleAlias: string | undefined = undefined;

  if (lazyNode.type === AsExpression) {
    [moduleName, moduleAlias] = await lazyNode.resolve();
  } else {
    moduleName = await lazyNode.resolve(false);
  }

  if (std.modules.find((m: any) => m.name === moduleName)) {
    std.panic(`Module ${moduleName} already loaded`);
  }

  if (moduleAlias) {
    const m = std.modules.find((m: any) => m.alias === moduleAlias);

    if (m) {
      std.panic(`Alias already used for module ${m.name}`);
    }
  }

  switch (moduleName) {
    case 'aragonos':
      std.modules.push(
        new AragonOS(std.bindingsManager, std.ipfsResolver, moduleAlias),
      );
      return;
    default:
      std.panic(`Module ${moduleName} not found`);
  }
};
