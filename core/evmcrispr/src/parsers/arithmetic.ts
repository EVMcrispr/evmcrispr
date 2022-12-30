import type { Parser } from 'arcsecond';
import {
  between,
  char,
  choice,
  coroutine,
  many1,
  optionalWhitespace,
  recursiveParser,
  sequenceOf,
} from 'arcsecond';

import type {
  BinaryExpressionNode,
  NodeParser,
  NodeParserState,
} from '../types';
import { NodeType } from '../types';
import { callExpressionParser } from './call';
import { helperFunctionParser } from './helper';
import { numberParser, variableIdentifierParser } from './primaries';
import {
  closingCharParser,
  createNodeLocation,
  locate,
  openingCharParser,
} from './utils';

// Taken from arcsecond's recipe cookbook (https://github.com/francisrstokes/arcsecond/blob/master/Cookbook.md#parse-expressions-while-respecting-operator-associativity-and-precedence)

const whitespaceSurrounded = (parser: Parser<any, string, NodeParserState>) =>
  between(optionalWhitespace)(optionalWhitespace)(parser);

const betweenParentheses = (parser: Parser<any, string, NodeParserState>) =>
  between(whitespaceSurrounded(char('(')))(whitespaceSurrounded(char(')')))(
    parser,
  );

const plus = char('+');
const minus = char('-');
const times = char('*');
const divide = char('/');
const exp = char('^');

type RawExpression = [
  BinaryExpressionNode['operator'],
  BinaryExpressionNode | RawExpression,
  BinaryExpressionNode | RawExpression,
];

// Utilize repetition instead of recursion to define binary expressions
const binaryExpression =
  (operator: Parser<string, string, NodeParserState>) =>
  (parser: Parser<any, string, NodeParserState>) =>
    locate<BinaryExpressionNode>(
      sequenceOf([
        whitespaceSurrounded(parser),
        many1(
          sequenceOf([
            whitespaceSurrounded(operator),
            whitespaceSurrounded(parser),
          ]),
        ),
      ]),
      ({ data: { line, offset }, index, result }) => {
        const [initialContext, res] = result;
        const [initialTerm, exp] = res as [BinaryExpressionNode, RawExpression];

        const n = [initialTerm, ...exp].reduce(
          (acc, curr): BinaryExpressionNode => {
            let n: BinaryExpressionNode;
            if (Array.isArray(curr)) {
              const right = curr[1] as BinaryExpressionNode['right'];
              n = {
                type: NodeType.BinaryExpression,
                operator: curr[0] as BinaryExpressionNode['operator'],
                left: acc as BinaryExpressionNode['left'],
                right: right,
                loc: createNodeLocation(initialContext, {
                  index: right.loc?.end.col ?? index,
                  line,
                  offset,
                }),
              };
            } else {
              n = curr as BinaryExpressionNode;
            }

            return n;
          },
        ) as BinaryExpressionNode;

        return n;
      },
    );

const operableExpressions = choice([
  callExpressionParser,
  helperFunctionParser,
  variableIdentifierParser([plus, minus, times, divide, exp, char(')')]),
  numberParser([plus, minus, times, divide, exp, char(')')]),
]);

// Each precedence group consists of a set of equal precedence terms,
// followed by a fall-through to the next level of precedence
const expression: Parser<any, string, NodeParserState> = recursiveParser(() =>
  choice([additionOrSubtraction, term]),
);
const term = recursiveParser(() => choice([multiplicationOrDivision, factor]));
const factor = recursiveParser(() => choice([exponentiation, baseOrPow]));
const baseOrPow = recursiveParser(() =>
  choice([operableExpressions, betweenParentheses(expression)]),
);

// Group operations of the same precedence together
const additionOrSubtraction = binaryExpression(choice([plus, minus]))(term);
const multiplicationOrDivision = binaryExpression(choice([times, divide]))(
  factor,
);
const exponentiation = binaryExpression(exp)(baseOrPow);

const buildArithmeticExpressionNode = (
  rawTreeExpression: RawExpression,
): BinaryExpressionNode => {
  const [operator, leftOperand, rightOperand] = rawTreeExpression;

  const n: BinaryExpressionNode = {
    type: NodeType.BinaryExpression,
    operator: operator as BinaryExpressionNode['operator'],
    left: Array.isArray(leftOperand)
      ? buildArithmeticExpressionNode(leftOperand)
      : leftOperand,
    right: Array.isArray(rightOperand)
      ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
        buildArithmeticExpressionNode(rightOperand)
      : rightOperand,
  };

  return n;
};

export const arithmeticParser: NodeParser<BinaryExpressionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      yield openingCharParser('(');

      const exp = (yield expression) as unknown as BinaryExpressionNode;
      yield closingCharParser(')');

      return exp;
    }),
  );
