import { between, char, choice, regex } from 'arcsecond';

import type { NodeParser, StringLiteralNode } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';

export const STRING_PARSER_ERROR = 'StringParserError';

export const stringParser: NodeParser<StringLiteralNode> = choice([
  between(char('"'))(char('"'))(regex(/^[^"]*/)),
  between(char("'"))(char("'"))(regex(/^[^']*/)),
])
  .errorMap((err) =>
    buildParserError(err, STRING_PARSER_ERROR, 'Expecting a quoted string'),
  )
  .map((value) => ({
    type: NodeType.StringLiteral,
    value: value as string,
  }));
