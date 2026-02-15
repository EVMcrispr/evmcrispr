import type {
  BarewordNode,
  EnclosingNodeParser,
  VariableIdentifierNode,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import type { Parser } from "arcsecond";
import {
  char,
  choice,
  coroutine,
  many1,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
} from "arcsecond";
import { createNodeLocation, enclosingLookaheadParser, locate } from "../utils";

export const VARIABLE_PARSER_ERROR = "VariableParserError";

export const BAREWORD_PARSER_ERROR = "IdentifierParserError";

export const variableIdentifierParser: EnclosingNodeParser<
  VariableIdentifierNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    locate<VariableIdentifierNode>(
      sequenceOf([
        regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
        enclosingLookaheadParser(enclosingParsers),
      ]).errorMap((err) =>
        buildParserError(err, VARIABLE_PARSER_ERROR, "Expecting a variable"),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.VariableIdentifier,
        value: value as VariableIdentifierNode["value"],
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
  sequenceOf(parsers).map((values) => values.join(""));

export const enclosedIdentifierParser: Parser<any, string, any> =
  recursiveParser(() =>
    many1(
      choice([
        sequenceOf_([char("("), possibly(enclosedIdentifierParser), char(")")]),
        sequenceOf_([char("["), possibly(enclosedIdentifierParser), char("]")]),
        encloseIdentifierRegexParser,
      ]),
    ).map((values) => values.filter((v) => !!v).join("")),
  );

export const barewordParser: EnclosingNodeParser<BarewordNode> = (
  enclosingParsers = [],
) =>
  recursiveParser(() =>
    locate<BarewordNode>(
      coroutine((run) => {
        const parts: string[] = run(
          many1(
            choice([
              sequenceOf_([
                char("("),
                possibly(enclosedIdentifierParser),
                char(")"),
              ]),
              sequenceOf_([
                char("["),
                possibly(enclosedIdentifierParser),
                char("]"),
              ]),
              identifierRegexParser,
            ]),
          ),
        );

        run(enclosingLookaheadParser(enclosingParsers));

        return [parts.filter((v) => !!v).join("")];
      }).errorMap((err) =>
        buildParserError(err, BAREWORD_PARSER_ERROR, "Expecting an identifier"),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.Bareword,
        value: value as BarewordNode["value"],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
