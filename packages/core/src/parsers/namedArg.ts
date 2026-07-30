import type { EnclosingNodeParser, NamedArgNode } from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";
import { coroutine, recursiveParser, regex } from "arcsecond";
import { argumentExpressionParser } from "./expression";
import { createNodeLocation, locate } from "./utils";

/**
 * `name:value` — a named argument inside helper parens, or a record entry
 * inside an array literal. Guards keep existing barewords untouched:
 *
 * - name is letters/digits/dashes, starts with a letter, doesn't end in `-`
 * - the colon must be immediately followed by the value (no whitespace)
 * - the value must not start with `/` (`https://x`, `ipfs://Qm…` stay
 *   barewords) or `:` (`x::method()` stays a call expression)
 *
 * On any mismatch the parser fails without consuming, so callers wrap it
 * in `possibly()` and fall through to the regular expression parsers.
 */
const NAMED_ARG_PREFIX_REGEX = /^[a-zA-Z][a-zA-Z0-9-]*(?<!-):(?![/:\s]|$)/;

export const namedArgParser: EnclosingNodeParser<NamedArgNode> = (
  enclosingParsers = [],
) =>
  recursiveParser(() =>
    locate<NamedArgNode>(
      coroutine((run) => {
        const prefix = run(regex(NAMED_ARG_PREFIX_REGEX)) as string;
        const name = prefix.slice(0, -1);
        const value = run(argumentExpressionParser(enclosingParsers));
        return [name, value];
      }),
      ({ data, index, result: [initialContext, [name, value]] }) => ({
        type: NodeType.NamedArg,
        name: name as string,
        value: value as NamedArgNode["value"],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
