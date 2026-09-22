/**
 * Declared errors: the named, ABI-encoded ways a command or helper can
 * refuse to run. Types only — the normalization, ABI derivation and `fail`
 * runtime live in `utils/declaredErrors`, so this module can be imported
 * from anywhere (including `errors.ts`) without a dependency cycle.
 */

/** The ArgDef scalars a declared error field may use. */
export type DeclaredFieldType =
  | "number"
  | "address"
  | "string"
  | "bool"
  | "bytes32";

/** The ABI type each declared scalar encodes as. */
export type DeclaredAbiType =
  | "uint256"
  | "address"
  | "string"
  | "bool"
  | "bytes32";

/** A typed value a script can destructure out of a captured error. */
export interface DeclaredErrorField {
  /** An ABI identifier, unique within its error. */
  readonly name: string;
  readonly type: DeclaredFieldType;
  readonly description?: string;
}

/** One declared error, keyed by its capitalised name in an `errors` block. */
export interface DeclaredErrorDef {
  /** What the failure means. Shown by docs, hover and completions. */
  readonly description: string;
  readonly fields?: readonly DeclaredErrorField[];
}

/** The `errors` block of a command or helper definition. */
export type DeclaredErrors = Readonly<Record<string, DeclaredErrorDef>>;

/** A declaration after validation: `fields` is always present. */
export interface NormalizedDeclaredError {
  readonly description: string;
  readonly fields: readonly DeclaredErrorField[];
}

/** A validated, deeply frozen `errors` block. */
export type NormalizedDeclaredErrors = Readonly<
  Record<string, NormalizedDeclaredError>
>;

/** The normalized view of one specific schema: the same names, each with
 *  its `fields` filled in. Keeps a definition's literal error names on the
 *  value the factories return instead of erasing them to
 *  {@link NormalizedDeclaredErrors}. */
export type NormalizedDeclaredErrorsOf<E extends DeclaredErrors> = {
  readonly [K in keyof E]: NormalizedDeclaredError;
};

/** The schema of a definition that declares no errors: no name is valid,
 *  so its `fail` rejects every call at compile time. The authoring default
 *  of `defineCommand` / `defineHelper`. */
export type NoDeclaredErrors = Record<never, never>;

/**
 * The structural face of the DSL `Num` accepted by a `number` field.
 * Declared here rather than imported so this module stays free of utils
 * imports; the runtime still requires a real `Num` instance.
 */
export interface DeclaredNumLike {
  readonly num: bigint;
  readonly den: bigint;
  isInteger(): boolean;
}

/** What `fail` accepts for a field of the given declared type. */
export type DeclaredFieldInput<T extends DeclaredFieldType> = T extends "number"
  ? bigint | number | DeclaredNumLike
  : T extends "address"
    ? `0x${string}`
    : T extends "bytes32"
      ? `0x${string}`
      : T extends "bool"
        ? boolean
        : string;

/** What a normalized field map stores: ABI-ready values. */
export type DeclaredErrorFieldValue = bigint | boolean | string;

/** The exact field map `fail` requires for one declared error. */
export type DeclaredErrorFields<D> = D extends {
  fields: infer F extends readonly DeclaredErrorField[];
}
  ? { [K in F[number] as K["name"]]: DeclaredFieldInput<K["type"]> }
  : Record<string, never>;

/** The names in `E` that declare no fields, so `fail(name, message)` works. */
export type FieldlessErrorName<E extends DeclaredErrors> = {
  [K in keyof E]: E[K] extends {
    fields: readonly [DeclaredErrorField, ...DeclaredErrorField[]];
  }
    ? never
    : K;
}[keyof E] &
  string;

/**
 * The `fail` of a run context, typed against that definition's literal
 * error names and exact field shapes. Always throws a `DeclaredError`.
 *
 * ```ts
 * fail("BelowMinimum", { minimum: 500n }, "a part is worth less than $5");
 * fail("NoBalance", "the funder holds no DAI"); // no fields declared
 * ```
 */
export interface FailFn<E extends DeclaredErrors = DeclaredErrors> {
  <N extends keyof E & string>(
    name: N,
    fields: DeclaredErrorFields<E[N]>,
    message: string,
  ): never;
  <N extends FieldlessErrorName<E>>(name: N, message: string): never;
}
