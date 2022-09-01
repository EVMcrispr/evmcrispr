import { utils } from 'ethers';

import type { Action } from '../../../..';

import { SIGNATURE_REGEX } from '../../../../utils';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { encodeAction } from '../../../utils/encoders';
import type { Std } from '../Std';

export const exec: CommandFunction<Std> = async (
  _,
  c,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(c, { type: ComparisonType.Greater, minValue: 3 });

  const targetNode = c.args.shift()!;
  const signatureNode = c.args.shift()!;

  const [targetAddress, signature, params] = await Promise.all([
    interpretNode(targetNode, { allowNotFoundError: true }),
    interpretNode(signatureNode, { treatAsLiteral: true }),
    interpretNodes(c.args),
  ]);

  if (!utils.isAddress(targetAddress)) {
    Interpreter.panic(
      c,
      `expected a valid target address, but got ${targetAddress}`,
    );
  }

  if (!SIGNATURE_REGEX.test(signature)) {
    Interpreter.panic(c, `expected a valid signature, but got ${signature}`);
  }

  let execAction: Action;

  try {
    execAction = encodeAction(targetAddress, signature, params);
  } catch (err) {
    const err_ = err as Error;
    Interpreter.panic(c, err_.message);
  }

  return [execAction];
};
