import type { Parser } from 'arcsecond';
import { char, possibly, regex, sequenceOf } from 'arcsecond';

import { optionalLabeledAppIdentifierRegex } from '../../../../utils';
import { Interpreter } from '../../../interpreter/Interpreter';
import type {
  CommandExpressionNode,
  Node,
  NodeInterpreter,
} from '../../../types';
import { NodeType } from '../../../types';
import { getOptValue } from '../../../utils';
import type { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';

export const DAO_OPT_NAME = 'dao';

export const daoPrefixedIdentifierParser: Parser<
  [string | undefined, string],
  string,
  any
> = sequenceOf([
  possibly(
    sequenceOf([char('_'), regex(/^((?!-)[a-zA-Z0-9-]+(?<!-))/), char(':')]),
  ),
  regex(optionalLabeledAppIdentifierRegex),
]).map(([prefix, appIdentifier]) => [
  prefix ? prefix[1] : undefined,
  appIdentifier,
]);

export const getDAO = (
  module: AragonOS,
  c: CommandExpressionNode,
  appIndex: number,
): AragonDAO => {
  let dao = module.currentDAO;
  const n: Node = c.args[appIndex];

  if (n.type === NodeType.ProbableIdentifier) {
    const res = daoPrefixedIdentifierParser.run(n.value);

    if (!res.isError && res.result[0]) {
      const [daoIdentifier] = res.result;

      dao = module.getModuleBinding(daoIdentifier);
      if (!dao) {
        Interpreter.panic(
          c,
          `couldn't found a DAO for ${daoIdentifier} on given identifier ${n.value}`,
        );
      }
    }
  }

  if (!dao) {
    Interpreter.panic(c, 'must be used within a "connect" command');
  }

  return dao;
};

export const getDAOByOption = async (
  module: AragonOS,
  c: CommandExpressionNode,
  interpretNode: NodeInterpreter,
): Promise<AragonDAO> => {
  let daoIdentifier = await getOptValue(c, 'dao', interpretNode);

  let dao: AragonDAO | undefined;

  if (!daoIdentifier) {
    dao = module.currentDAO;
    if (!dao) {
      Interpreter.panic(c, `must be used within a "connect" command`);
    }
  } else {
    daoIdentifier = daoIdentifier.toString
      ? daoIdentifier.toString()
      : daoIdentifier;
    dao = module.getModuleBinding(daoIdentifier);
    if (!dao) {
      Interpreter.panic(
        c,
        `--dao option error. No DAO found for identifier ${daoIdentifier}`,
      );
    }
  }

  return dao;
};
