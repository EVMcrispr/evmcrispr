import type {
  DeclaredError,
  ErrorException,
  NormalizedDeclaredErrors,
} from "@evmcrispr/sdk";
import { findDeclaredError } from "@evmcrispr/sdk";
import { assertErrorMatches } from "../expects";

/** Value a test may write for a declared field. A `number` stands in for a
 *  uint256 (`bigint`) value, and an address compares regardless of the
 *  checksum casing the raise site normalized it to. */
export type DeclaredFieldExpectation = bigint | number | boolean | string;

/** A declared refusal a test expects: the error's name, plus any fields it
 *  wants to pin. Fields left out are not checked. */
export interface DeclaredErrorExpectation {
  name: string;
  fields?: Readonly<Record<string, DeclaredFieldExpectation>>;
}

/**
 * Where a suite's declaration metadata comes from: a `defineCommand` /
 * `defineHelper` definition, or its normalized `errors` block.
 */
export type DeclaredErrorsSource =
  | NormalizedDeclaredErrors
  | { readonly errors?: NormalizedDeclaredErrors };

/** A test case that may designate a declared error. */
export interface DeclaredErrorCase {
  declared?: DeclaredErrorExpectation;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ERROR_NAME = /^[A-Z][A-Za-z0-9_]*$/;

/**
 * Assert that `error` — or something in its bounded cause chain, which is
 * where the interpreter's location and helper wrappers put it — is the
 * declared error the case expects. Returns it, so a caller can inspect more.
 *
 * Hand-written suites use this directly; `describeCommand` / `describeHelper`
 * call it for a case's `declared` expectation.
 */
export function expectDeclaredError(
  error: unknown,
  expected: DeclaredErrorExpectation,
): DeclaredError {
  const declared = findDeclaredError(error);
  if (!declared) {
    throw new Error(
      `Expected declared error "${expected.name}", but the failure carries no declared error: ${describeFailure(error)}`,
    );
  }
  if (declared.errorName !== expected.name) {
    throw new Error(
      `Expected declared error "${expected.name}", got "${declared.errorName}": ${declared.message}`,
    );
  }
  for (const [field, want] of Object.entries(expected.fields ?? {})) {
    if (!Object.hasOwn(declared.fields, field)) {
      const known = Object.keys(declared.fields);
      throw new Error(
        `Declared error "${declared.errorName}" has no field "${field}" (declares ${known.length ? known.map((f) => `"${f}"`).join(", ") : "no fields"})`,
      );
    }
    const got = declared.fields[field];
    if (!fieldEquals(got, want)) {
      throw new Error(
        `Declared error "${declared.errorName}" field "${field}": expected ${show(want)}, got ${show(got)}`,
      );
    }
  }
  return declared;
}

/**
 * Run a script (or expression) that must refuse, and assert the declared
 * error it raised — optionally also matching the raise-site message.
 *
 * This is what a `declared` case runs: the failure has to happen, it has to
 * carry that declared error, and the fields the case names have to match.
 */
export async function expectDeclaredFailure(
  run: () => Promise<unknown>,
  expected: DeclaredErrorExpectation,
  what: string,
  message?: string | RegExp | ErrorException,
): Promise<DeclaredError> {
  let thrown: unknown;
  let threw = false;
  try {
    await run();
  } catch (err) {
    thrown = err;
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `Expected ${what} to fail with declared error "${expected.name}", but it succeeded`,
    );
  }
  const declared = expectDeclaredError(thrown, expected);
  if (message !== undefined) assertErrorMatches(thrown, message);
  return declared;
}

/** The declared error names of a definition (or of its `errors` block), in
 *  declaration order. */
export function declaredErrorNames(source: DeclaredErrorsSource): string[] {
  return Object.keys(errorsBlock(source));
}

/**
 * The declared names no case designates. Computed when a suite is
 * registered, from the cases themselves — never from a set some earlier
 * test populated, which would depend on test order, concurrency and `-t`
 * filtering.
 */
export function missingDeclaredErrorCases(
  source: DeclaredErrorsSource,
  cases: readonly DeclaredErrorCase[] = [],
): string[] {
  const covered = new Set(
    cases.map((c) => c.declared?.name).filter((n): n is string => !!n),
  );
  return declaredErrorNames(source).filter((name) => !covered.has(name));
}

/**
 * Registration-time contract for a suite's error cases: every case states an
 * expectation, and every declared name has a case designating it.
 * Throws — the suite never registers — so the check cannot be filtered away.
 */
export function checkDeclaredErrorCases<
  C extends DeclaredErrorCase & { error?: unknown },
>(
  label: string,
  cases: readonly C[],
  declaredErrors: DeclaredErrorsSource | undefined,
  caseLabel: (c: C, index: number) => string,
): void {
  cases.forEach((c, i) => {
    if (c.error === undefined && !c.declared) {
      throw new Error(
        `${label}: error case ${caseLabel(c, i)} states no expectation — give it an \`error\` message/matcher, a \`declared\` error, or both.`,
      );
    }
  });
  if (!declaredErrors) return;
  const missing = missingDeclaredErrorCases(declaredErrors, cases);
  if (missing.length) {
    throw new Error(
      `${label}: no error case designates ${missing.map((n) => `"${n}"`).join(", ")}. Add a case with \`declared: { name: "${missing[0]}" }\`, or drop \`declaredErrors\` to stop checking coverage.`,
    );
  }
}

function errorsBlock(source: DeclaredErrorsSource): NormalizedDeclaredErrors {
  if (source && (typeof source === "object" || typeof source === "function")) {
    if ("errors" in source) {
      return (source.errors ?? {}) as NormalizedDeclaredErrors;
    }
    const entries = Object.entries(source as NormalizedDeclaredErrors);
    const declarations = entries.every(
      ([name, def]) =>
        ERROR_NAME.test(name) &&
        !!def &&
        typeof def === "object" &&
        typeof (def as { description?: unknown }).description === "string",
    );
    if (declarations) return source as NormalizedDeclaredErrors;
  }
  throw new Error(
    "declaredErrors must be a definition or its `errors` block (a map of declared name to { description, fields })",
  );
}

function fieldEquals(got: unknown, want: DeclaredFieldExpectation): boolean {
  if (typeof got === "bigint" && typeof want === "number") {
    return Number.isSafeInteger(want) && got === BigInt(want);
  }
  if (
    typeof got === "string" &&
    typeof want === "string" &&
    ADDRESS.test(got) &&
    ADDRESS.test(want)
  ) {
    return got.toLowerCase() === want.toLowerCase();
  }
  return got === want;
}

function show(value: unknown): string {
  return typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return `${error.constructor.name}: ${error.message}`;
  }
  return String(error);
}
