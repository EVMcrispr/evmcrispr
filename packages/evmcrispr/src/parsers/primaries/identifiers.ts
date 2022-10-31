import type { Parser } from 'arcsecond';
import {
  char,
  choice,
  coroutine,
  many1,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
} from 'arcsecond';

import type {
  EnclosingNodeParser,
  ProbableIdentifierNode,
  VariableIdentifierNode,
} from '../../types';
import { NodeType } from '../../types';
import { buildParserError } from '../../utils/parsers';
import { createNodeLocation, enclosingLookaheadParser, locate } from '../utils';

export const VARIABLE_PARSER_ERROR = 'VariableParserError';

export const PROBABLE_IDENTIFIER_PARSER_ERROR = 'IdentifierParserError';

export const variableIdentifierParser: EnclosingNodeParser<
  VariableIdentifierNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    locate<VariableIdentifierNode>(
      sequenceOf([
        regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
        enclosingLookaheadParser(enclosingParsers),
      ]).errorMap((err) =>
        buildParserError(err, VARIABLE_PARSER_ERROR, 'Expecting a variable'),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.VariableIdentifier,
        value: value as VariableIdentifierNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );

const identifierRegexParser = regex(
  /^(?:(?!::|--|#|,|\(|\[|\)|\]|@|\s|"|').)+/,
);
const encloseIdentifierRegexParser = regex(
  /^(?:(?!::|--|#|\(|\[|\)|\]|-|\+|\/|\*|@|\s|'|").)+/,
);

const sequenceOf_ = (parsers: Parser<any, string, any>[]) =>
  sequenceOf(parsers).map((values) => values.join(''));

export const enclosedIdentifierParser: Parser<any, string, any> =
  recursiveParser(() =>
    many1(
      choice([
        sequenceOf_([char('('), possibly(enclosedIdentifierParser), char(')')]),
        sequenceOf_([char('['), possibly(enclosedIdentifierParser), char(']')]),
        encloseIdentifierRegexParser,
      ]),
    ).map((values) => values.filter((v) => !!v).join('')),
  );

export const probableIdentifierParser: EnclosingNodeParser<
  ProbableIdentifierNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    locate<ProbableIdentifierNode>(
      coroutine(function* () {
        const parts = (yield many1(
          choice([
            sequenceOf_([
              char('('),
              possibly(enclosedIdentifierParser),
              char(')'),
            ]),
            sequenceOf_([
              char('['),
              possibly(enclosedIdentifierParser),
              char(']'),
            ]),
            identifierRegexParser,
          ]),
        )) as unknown as string[];

        yield enclosingLookaheadParser(enclosingParsers);

        return [parts.filter((v) => !!v).join('')];
      }).errorMap((err) =>
        buildParserError(
          err,
          PROBABLE_IDENTIFIER_PARSER_ERROR,
          'Expecting an identifier',
        ),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.ProbableIdentifier,
        value: value as ProbableIdentifierNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
