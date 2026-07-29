import { ErrorException, Num } from "@evmcrispr/sdk";

/** Parse the --request-id opt; 0 (the controller-keyed convention) if absent. */
export function parseRequestId(opts: Record<string, any>): bigint {
  if (opts["request-id"] === undefined) return 0n;
  let requestId: bigint;
  try {
    requestId = Num(opts["request-id"] as string).toBigInt();
  } catch {
    throw new ErrorException(
      `--request-id must be a number, got ${opts["request-id"]}`,
    );
  }
  if (requestId < 0n) {
    throw new ErrorException("--request-id must not be negative");
  }
  return requestId;
}

/** Parse the --exact opt against the command's default overload. */
export function parseExact(
  opts: Record<string, any>,
  defaultExact: "assets" | "shares",
): "assets" | "shares" {
  const exact = opts.exact ?? defaultExact;
  if (exact !== "assets" && exact !== "shares") {
    throw new ErrorException(
      `--exact must be \`assets\` or \`shares\`, got ${exact}`,
    );
  }
  return exact;
}
