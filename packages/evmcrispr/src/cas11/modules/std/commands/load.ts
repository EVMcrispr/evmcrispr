import { ErrorInvalid } from '../../../../errors';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
} from '../../../utils';
import { AragonOS } from '../../aragonos/AragonOS';
import type { Std } from '../Std';

const { Command } = CallableExpression;
const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

export const load: CommandFunction<Std> = async (std, lazyNodes) => {
  checkArgsLength('load', Command, lazyNodes.length, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [lazyNode] = lazyNodes;
  const type = lazyNode.type;
  const isIdentifier = type === ProbableIdentifier || type === StringLiteral;

  if (type !== AsExpression && type !== StringLiteral && !isIdentifier) {
    Interpreter.panic(
      Command,
      'load',
      ErrorInvalid,
      'invalid argument. Expected a string',
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
    Interpreter.panic(
      Command,
      'load',
      ErrorInvalid,
      `module ${moduleName} already loaded`,
    );
  }

  if (moduleAlias) {
    const m = std.modules.find((m: any) => m.alias === moduleAlias);

    if (m) {
      Interpreter.panic(
        Command,
        'load',
        ErrorInvalid,
        `alias already used for module ${m.name}`,
      );
    }
  }

  switch (moduleName) {
    case 'aragonos':
      std.modules.push(
        new AragonOS(
          std.bindingsManager,
          std.signer,
          std.ipfsResolver,
          moduleAlias,
        ),
      );
      return;
    default:
      Interpreter.panic(
        Command,
        'load',
        ErrorInvalid,
        `module ${moduleName} not found`,
      );
  }
};
