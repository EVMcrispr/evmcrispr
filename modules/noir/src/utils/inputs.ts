/**
 * Parse the `--inputs` option into the named-input map noir_js expects.
 * Primary form is an EVML entries array `[[x 3] [y 11]]` (values may nest
 * for array inputs); a JSON object string is also accepted for interop
 * with `Prover.toml`-shaped JSON (pasted or fetched) — and it is the only
 * way to express struct inputs.
 */
import { ErrorException, Num } from "@evmcrispr/sdk";

export function parseNoirInputs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ErrorException(
        `noir:prove: --inputs must be an entries array like [[x 3] [y 11]] or a JSON object string, got ${value}`,
      );
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new ErrorException(
        `noir:prove: --inputs JSON must be an object of circuit inputs, got ${value}`,
      );
    }
    return parsed as Record<string, unknown>;
  }
  if (!Array.isArray(value)) {
    throw new ErrorException(
      "noir:prove: --inputs must be an entries array like [[x 3] [y 11]] or a JSON object string",
    );
  }
  const inputs: Record<string, unknown> = {};
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new ErrorException(
        `noir:prove: --inputs entries must be [name value] pairs, got ${JSON.stringify(entry)}`,
      );
    }
    const [name, input] = entry;
    if (typeof name !== "string" || name === "") {
      throw new ErrorException(
        `noir:prove: --inputs input names must be strings, got ${name}`,
      );
    }
    if (inputs[name] !== undefined) {
      throw new ErrorException(
        `noir:prove: --inputs has a duplicate input "${name}"`,
      );
    }
    inputs[name] = toInputValue(input, name);
  }
  return inputs;
}

/**
 * noirc_abi is ABI-aware (decimal/hex strings, booleans, nested arrays),
 * so values pass through mostly unchanged — only script-native numerics
 * are normalized to decimal strings.
 */
function toInputValue(value: unknown, name: string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => toInputValue(v, name));
  }
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ErrorException(
        `noir:prove: --inputs input "${name}" has an unsupported value: ${value}`,
      );
    }
    return String(value);
  }
  try {
    const num = Num(value);
    if (!num.isInteger()) throw new Error("non-integer");
    return num.toBigInt().toString();
  } catch {
    throw new ErrorException(
      `noir:prove: --inputs input "${name}" has an unsupported value: ${value}`,
    );
  }
}
