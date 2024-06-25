import { char, choice, coroutine, digits, possibly, str } from "arcsecond";

import type { EnclosingNodeParser, NumericLiteralNode } from "../../../types";
import { NodeType } from "../../../types";
import { buildParserError } from "../../../utils/parsers";
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from "../../utils";

export const NUMBER_PARSER_ERROR = "NumberParserError";

const timeUnitsParser = choice([
  str("mo"),
  str("s"),
  str("m"),
  str("h"),
  str("d"),
  str("w"),
  str("y"),
]);

export const numberParser: EnclosingNodeParser<NumericLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<NumericLiteralNode>(
    coroutine((run) => {
      let value: string;

      const integers = run(digits);

      if (run(possibly(char(".")))) {
        const decimals = run(
          digits.errorMap((err) =>
            buildParserError(
              err,
              NUMBER_PARSER_ERROR,
              "Invalid decimal. Expecting digits",
            ),
          ),
        );

        value = `${integers}.${decimals}`;
      } else {
        value = String(integers);
      }

      let power: string | undefined;
      if (run(possibly(char("e")))) {
        power = run(
          digits.errorMap((err) =>
            buildParserError(
              err,
              "NumberParserError",
              "Invalid exponent. Expecting digits",
            ),
          ),
        );
      }

      const timeUnit: string | null = run(possibly(timeUnitsParser));

      run(
        enclosingLookaheadParser(enclosingParsers).errorMap((err) =>
          buildParserError(
            err,
            "NumberParserError",
            `Invalid time unit. Expected "s", "m", "h", "d", "w", "mo" or "y"`,
          ),
        ),
      );

      return [value, power ? parseInt(power) : undefined, timeUnit];
    }),
    ({ data, index, result: [initialContext, [value, power, timeUnit]] }) => {
      return {
        type: NodeType.NumberLiteral,
        value: value as NumericLiteralNode["value"],
        ...(power ? { power: power as NumericLiteralNode["power"] } : {}),
        ...(timeUnit
          ? { timeUnit: timeUnit as NumericLiteralNode["timeUnit"] }
          : {}),
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );
