import { char, coroutine, digits, letters, possibly } from 'arcsecond';

import type { NodeParser, NumericLiteralNode } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import { enclosingLookaheadParser } from '../../utils';

export const NUMBER_PARSER_ERROR = 'NumberParserError';

export const numberParser: NodeParser<NumericLiteralNode> = coroutine(
  function* () {
    let value: number;

    const integers = yield digits;

    if (yield possibly(char('.'))) {
      const decimals = yield digits.errorMap((err) =>
        buildParserError(
          err,
          NUMBER_PARSER_ERROR,
          'Invalid decimal. Expecting digits',
        ),
      );

      value = Number(`${integers}.${decimals}`);
    } else {
      value = Number(integers);
    }

    let power: string | undefined;
    if (yield possibly(char('e'))) {
      power = (yield digits.errorMap((err) =>
        buildParserError(
          err,
          'NumberParserError',
          'Invalid exponent. Expecting digits',
        ),
      )) as unknown as string;
    }

    const timeUnit = yield possibly(letters);

    if (timeUnit) {
      yield enclosingLookaheadParser.errorMap((err) =>
        buildParserError(
          err,
          'NumberParserError',
          'Invalid time unit. Expecting letters only',
        ),
      );
    }

    const n: NumericLiteralNode = {
      type: NodeType.NumberLiteral,
      value,
    };

    if (power) {
      n.power = parseInt(power);
    }

    if (timeUnit) {
      n.timeUnit = timeUnit;
    }

    return n;
  },
);
