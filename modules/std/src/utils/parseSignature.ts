import { ErrorException } from "@evmcrispr/sdk";
import type { ArgDef, OptDef } from "@evmcrispr/sdk";

export interface ParsedSignature {
  params: ArgDef[];
  opts: OptDef[];
  returnType?: string;
}

const REQUIRED_RE = /^\$(\w[\w-]*):\s*(\S+)$/;
const OPTIONAL_RE = /^\[\$(\w[\w-]*):\s*(\S+)\]$/;
const REST_RE = /^\.\.\.\$(\w[\w-]*):\s*(\S+)$/;
const OPTION_RE = /^\[--(\w[\w-]*):\s*(\S+)\]$/;
const HELPER_PARAM_RE = /^@(\w[\w-]*)$/;
const BARE_PARAM_RE = /^\$(\w[\w-]*)$/;
const RETURN_RE = /\s*->\s*(\S+)\s*$/;
const TOKEN_RE =
  /\[--\w[\w-]*:\s*\S+\]|\[\$\w[\w-]*:\s*\S+\]|\.\.\.\$\w[\w-]*:\s*\S+|\$\w[\w-]*:\s*\S+|\$\w[\w-]*|@\w[\w-]*/g;

export function parseSignature(sig: string): ParsedSignature {
  const trimmed = sig.trim();

  if (trimmed === "") {
    return { params: [], opts: [] };
  }

  if (!trimmed.includes("$") && !trimmed.includes("--") && !trimmed.includes("@")) {
    return { params: [], opts: [], returnType: trimmed };
  }

  let body = trimmed;
  let returnType: string | undefined;

  const returnMatch = body.match(RETURN_RE);
  if (returnMatch) {
    returnType = returnMatch[1];
    body = body.slice(0, -returnMatch[0].length);
  }

  const params: ArgDef[] = [];
  const opts: OptDef[] = [];
  const tokens = body.match(TOKEN_RE) ?? [];

  let seenOptional = false;

  for (const token of tokens) {
    let m: RegExpMatchArray | null;

    if ((m = token.match(OPTION_RE))) {
      opts.push({ name: m[1], type: m[2] });
      continue;
    }

    if ((m = token.match(REST_RE))) {
      if (params.length > 0 && params.at(-1)?.rest) {
        throw new ErrorException("only one rest parameter is allowed");
      }
      params.push({ name: m[1], type: m[2], rest: true });
      continue;
    }

    if ((m = token.match(OPTIONAL_RE))) {
      seenOptional = true;
      params.push({ name: m[1], type: m[2], optional: true });
      continue;
    }

    if ((m = token.match(HELPER_PARAM_RE))) {
      if (seenOptional) {
        throw new ErrorException(
          "required parameters must come before optional ones",
        );
      }
      params.push({ name: m[1], type: "helper" });
      continue;
    }

    if ((m = token.match(REQUIRED_RE))) {
      if (seenOptional) {
        throw new ErrorException(
          "required parameters must come before optional ones",
        );
      }
      params.push({ name: m[1], type: m[2] });
      continue;
    }

    if ((m = token.match(BARE_PARAM_RE))) {
      if (seenOptional) {
        throw new ErrorException(
          "required parameters must come before optional ones",
        );
      }
      params.push({ name: m[1], type: "any" });
      continue;
    }
  }

  const restIndex = params.findIndex((p) => p.rest);
  if (restIndex !== -1 && restIndex !== params.length - 1) {
    throw new ErrorException("rest parameter must be the last parameter");
  }

  return { params, opts, returnType };
}
