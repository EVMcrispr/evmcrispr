import { char, coroutine, digits, letters, possibly } from 'arcsecond';

import type { NodeParser, NumericLiteralNode } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from '../../utils';

export const NUMBER_PARSER_ERROR = 'NumberParserError';

export const numberParser: NodeParser<NumericLiteralNode> =
  locate<NumericLiteralNode>(
    coroutine(function* () {
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
        )) as unknown as string | undefined;
      }

      const timeUnit = (yield possibly(letters)) as unknown as
        | string
        | undefined;

      yield enclosingLookaheadParser.errorMap((err) =>
        buildParserError(
          err,
          'NumberParserError',
          'Invalid time unit. Expecting letters only',
        ),
      );

      return [value, power ? parseInt(power) : undefined, timeUnit];
    }),
    ({ data, index, result: [initialContext, [value, power, timeUnit]] }) => {
      return {
        type: NodeType.NumberLiteral,
        value: value as NumericLiteralNode['value'],
        ...(power ? { power: power as NumericLiteralNode['power'] } : {}),
        ...(timeUnit
          ? { timeUnit: timeUnit as NumericLiteralNode['timeUnit'] }
          : {}),
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );
