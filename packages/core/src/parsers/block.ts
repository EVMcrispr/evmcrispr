import type {
  BlockExpressionNode,
  CommandExpressionNode,
  NodeParser,
  NodeParserState,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  char,
  coroutine,
  getData,
  possibly,
  recursiveParser,
  sequenceOf,
} from "arcsecond";
import { commandExpressionParser } from "./command";
import {
  closingCharParser,
  createNodeLocation,
  endLine,
  linesParser,
  locate,
  openingCharParser,
} from "./utils";

const BLOCK_PARSER_ERROR = "BlockParserError";

export const blockExpressionParser: NodeParser<BlockExpressionNode> =
  recursiveParser(() =>
    locate<BlockExpressionNode>(
      coroutine((run) => {
        const [initialState, initialIndex]: [NodeParserState, number] = run(
          getData.mapFromData(({ data, index }) => [data, index]),
        );
        const smart = !!run(possibly(char("!")));
        run(sequenceOf([openingCharParser("("), endLine]));

        const scopedCommands: CommandExpressionNode[] = run(
          linesParser(commandExpressionParser, closingCharParser(")"), {
            endingChar: ")",
            parserErrorType: BLOCK_PARSER_ERROR,
            initialState,
            initialIndex,
          }),
        );

        return [scopedCommands, smart];
      }).errorMap((err) => buildParserError(err, BLOCK_PARSER_ERROR)),
      ({
        data: { line, offset },
        index,
        result: [initialContext, [scopedCommands, smart]],
      }) => ({
        type: NodeType.BlockExpression,
        ...(smart ? { smart: true } : {}),
        body: scopedCommands as BlockExpressionNode["body"],
        loc: createNodeLocation(initialContext, { index, line, offset }),
      }),
    ),
  );
