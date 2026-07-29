import { ErrorException } from "@evmcrispr/sdk";

/** Verbatim interpolation escape hatch — see `evml.raw(...)`. */
export class EvmlRaw {
  constructor(readonly text: string) {}

  toString(): string {
    return this.text;
  }
}

// `ErrorException` already derives `name`/`code` from the constructor name.
export class EvmlSerializationError extends ErrorException {}

/** Values accepted by `${...}` interpolations in the `evml` tag. */
export type EvmlValue =
  | string
  | number
  | bigint
  | boolean
  | EvmlRaw
  | { toString(): string } // EvmlScript-shaped fragments compose via toString()
  | EvmlValue[];

const HEX_RE = /^0x[a-fA-F0-9]*$/;

/**
 * Escape a string for a single-quoted EVML string literal. Every escape
 * produced here is understood by the string parser's `ESCAPE_RE`
 * (`packages/core/src/parsers/primaries/literals/string.ts`); control
 * characters go through `\u{...}` so no raw byte can terminate the quote.
 */
function escapeString(value: string): string {
  let out = "";
  for (const ch of value) {
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case "'":
        out += "\\'";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default: {
        const code = ch.codePointAt(0)!;
        out += code < 0x20 ? `\\u{${code.toString(16)}}` : ch;
      }
    }
  }
  return out;
}

/**
 * Serialize a JS value into EVML source text.
 *
 * - hex-looking strings (`0x...`) are spliced bare so `${addr}` yields an
 *   address/bytes literal; quote manually or use `evml.raw` for the rare
 *   hex-looking *string* case
 * - other strings become single-quoted literals, injection-safe
 * - numbers/bigints become decimal literals (negatives are valid EVML)
 * - arrays become space-separated `[a b c]` EVML arrays
 * - `EvmlRaw` and `EvmlScript` fragments are spliced verbatim
 */
export function serializeEvmlValue(value: unknown, index?: number): string {
  const at = index !== undefined ? ` at interpolation #${index + 1}` : "";

  if (value === null || value === undefined) {
    throw new EvmlSerializationError(
      `Cannot interpolate ${value === null ? "null" : "undefined"}${at}`,
    );
  }

  if (value instanceof EvmlRaw) return value.text;

  switch (typeof value) {
    case "string":
      return HEX_RE.test(value) ? value : `'${escapeString(value)}'`;
    case "bigint":
      return value.toString();
    case "number": {
      if (!Number.isFinite(value)) {
        throw new EvmlSerializationError(
          `Cannot interpolate non-finite number ${value}${at}`,
        );
      }
      const text = value.toString();
      // toString() switches to exponent notation for very large/small
      // magnitudes, which EVML's grammar doesn't accept.
      if (text.includes("e") || text.includes("E")) {
        throw new EvmlSerializationError(
          `Cannot interpolate ${value}${at}: exponent notation is not a valid EVML literal. Use a bigint or a string instead.`,
        );
      }
      return text;
    }
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => serializeEvmlValue(v, index)).join(" ")}]`;
      }
      // EvmlScript (or any fragment) composes through its source text via
      // a custom toString(); plain objects keep Object.prototype.toString
      // and are rejected.
      if (
        typeof (value as any).toString === "function" &&
        (value as any).toString !== Object.prototype.toString
      ) {
        return String(value);
      }
      throw new EvmlSerializationError(`Cannot interpolate object${at}`);
    }
    default:
      throw new EvmlSerializationError(
        `Cannot interpolate value of type ${typeof value}${at}`,
      );
  }
}

/** Join a tagged-template invocation into EVML source text. */
export function serializeTemplate(
  strings: TemplateStringsArray,
  values: EvmlValue[],
): string {
  let source = strings[0];
  for (let i = 0; i < values.length; i++) {
    source += serializeEvmlValue(values[i], i) + strings[i + 1];
  }
  return source;
}
