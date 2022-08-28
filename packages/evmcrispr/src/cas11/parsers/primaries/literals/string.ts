import { between, char, choice, regex } from 'arcsecond';

import type { NodeParser, StringLiteralNode } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import { createNodeLocation, locate } from '../../utils';

export const STRING_PARSER_ERROR = 'StringParserError';

export const stringParser: NodeParser<StringLiteralNode> =
  locate<StringLiteralNode>(
    choice<any, any>([
      between(char('"'))(char('"'))(regex(/^[^"]*/)),
      between(char("'"))(char("'"))(regex(/^[^']*/)),
    ])
      .map((x) => [x])
      .errorMap((err) =>
        buildParserError(err, STRING_PARSER_ERROR, 'Expecting a quoted string'),
      ),
    ({ data, index, result: [initialContext, [value]] }) => {
      return {
        type: NodeType.StringLiteral,
        value: value as StringLiteralNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );
