import type { EnclosingNodeParser, NumericLiteralNode } from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import { char, choice, coroutine, digits, possibly, str } from "arcsecond";
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

const ethUnitsPower: Record<string, number> = {
  wei: 0,
  gwei: 9,
  eth: 18,
};

const ethUnitsParser = choice([str("eth"), str("gwei"), str("wei")]);

export const numberParser: EnclosingNodeParser<NumericLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<NumericLiteralNode>(
    coroutine((run) => {
      let value: string;

      // A minus sign is only part of a number literal when immediately
      // followed by digits; otherwise the whole parser fails and the
      // enclosing choice backtracks (barewords like `token-manager` and
      // option flags like `--block-number` are unaffected).
      const sign = run(possibly(char("-"))) ?? "";

      const integers = sign + run(digits);

      if (run(possibly(char(".")))) {
        const decimals = run(
          digits.errorMap((err) =>
            buildParserError(
              err,
              NUMBER_PARSER_ERROR,
              "Invalid number: expected digits after the decimal point (e.g. 1.5)",
            ),
          ),
        );

        value = `${integers}.${decimals}`;
      } else {
        value = String(integers);
      }

      let power: number | undefined;
      const ethUnit: string | null = run(possibly(ethUnitsParser));
      if (ethUnit) {
        power = ethUnitsPower[ethUnit];
      } else if (run(possibly(char("e")))) {
        const powerStr = run(
          digits.errorMap((err) =>
            buildParserError(
              err,
              "NumberParserError",
              'Invalid number: expected digits after "e" (e.g. 15e18)',
            ),
          ),
        );
        power = parseInt(powerStr, 10);
      }

      let perTime = false;
      let timeUnit: string | null;
      if (run(possibly(char("/")))) {
        perTime = true;
        timeUnit = run(
          timeUnitsParser.errorMap((err) =>
            buildParserError(
              err,
              NUMBER_PARSER_ERROR,
              'Invalid rate: expected a time unit after "/" (e.g. 1000e18/mo)',
            ),
          ),
        );
      } else {
        timeUnit = run(possibly(timeUnitsParser));
      }

      run(
        enclosingLookaheadParser(enclosingParsers).errorMap((err) =>
          buildParserError(
            err,
            "NumberParserError",
            "Invalid time unit. Valid units: s, m, h, d, w, mo, y (e.g. 30m, 2d)",
          ),
        ),
      );

      return [value, power, timeUnit, perTime];
    }),
    ({
      data,
      index,
      result: [initialContext, [value, power, timeUnit, perTime]],
    }) => {
      return {
        type: NodeType.NumberLiteral,
        value: value as NumericLiteralNode["value"],
        ...(power !== undefined
          ? { power: power as NumericLiteralNode["power"] }
          : {}),
        ...(timeUnit
          ? { timeUnit: timeUnit as NumericLiteralNode["timeUnit"] }
          : {}),
        ...(perTime ? { perTime: true } : {}),
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );
