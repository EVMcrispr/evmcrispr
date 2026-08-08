import type { Address, Module, Param, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException, encodeParams } from "@evmcrispr/sdk";
import type { AbiFunction, AbiParameter, Hex } from "viem";
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toFunctionSelector,
} from "viem";
import { resolveAssertionsContract } from "./assertions";
import { encodeCalc, encodeData } from "./combinators";
import type { ComposableExecution, InputParam } from "./erc8211";
import {
  ASSERT_COMPOSABLE_SELECTOR,
  ASSERT_PARAM_SELECTOR,
  encodeAssertComposable,
  encodeAssertParam,
  rawParam,
  staticCallParam,
  targetParam,
  toWord,
  wordParam,
} from "./erc8211";

/**
 * Nested live call arguments compile through "bytes with holes": the
 * enclosing call's calldata is fixed bytes with 32-byte HOLE MARKERS where
 * runtime-resolved values go. Markers survive any ABI embedding (combinator
 * operands, fetcher paramData, batch encodings), so at emission time the
 * encoded assertion is scanned for them and rebuilt as ERC-8211
 * construction entries: fixed spans become RAW_BYTES params, each marker
 * becomes its registered fetcher, and the entry constructs the call to
 * `assertParam`/`assertComposable` itself — one entry per nesting level,
 * assertions judging assertions.
 */

// ---------------------------------------------------------------------------
//  Hole registry
// ---------------------------------------------------------------------------

interface DynHole {
  /** The nav-combinator param whose resolved envelope fills the hole. */
  nav: InputParam;
  /** Marker hex (no 0x). */
  marker: string;
}

export interface HoleRegistry {
  /** marker hex (lowercase, no 0x) -> the fetcher that fills the hole with
   *  a single 32-byte word at judge time. */
  words: Map<string, InputParam>;
  /** The single dynamic-envelope hole, when present (see dynHole). */
  dyn?: DynHole;
  counter: number;
}

export function createHoleRegistry(): HoleRegistry {
  return { words: new Map(), counter: 0 };
}

function newMarker(reg: HoleRegistry): string {
  // Deterministic per compilation so encodings are stable in tests; 32
  // random-looking bytes cannot collide with real calldata content.
  return keccak256(
    stringToHex(`evmcrispr/assertions hole ${reg.counter++}`),
  ).slice(2);
}

/** Register a word hole: `fetcher` must resolve to exactly 32 bytes at
 *  judge time. Returns the 32-byte marker to embed in place of the value. */
export function wordHole(reg: HoleRegistry, fetcher: InputParam): Hex {
  const marker = newMarker(reg);
  reg.words.set(marker, fetcher);
  return `0x${marker}`;
}

/** Register THE dynamic-envelope hole: `nav` resolves to a canonical
 *  single-value envelope ([0x20][length][payload]) whose size is unknown
 *  at build time. At most one per assertion, and only in the outermost
 *  constructed call (every enclosing length/offset word is emitted as a
 *  computed word hole over the envelope's ByteLen). */
export function dynHole(reg: HoleRegistry, nav: InputParam): Hex {
  if (reg.dyn) {
    throw new ErrorException(
      "only one dynamic-typed nested call argument is supported per assertion",
    );
  }
  const marker = newMarker(reg);
  reg.dyn = { nav, marker };
  return `0x${marker}`;
}

function hasMarkers(reg: HoleRegistry, hex: Hex): boolean {
  const body = hex.slice(2).toLowerCase();
  if (reg.dyn && body.includes(reg.dyn.marker)) return true;
  for (const marker of reg.words.keys()) {
    if (body.includes(marker)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
//  Calldata with holes
// ---------------------------------------------------------------------------

/** One argument of a constructed call. */
export type ArgSpec =
  | { kind: "value"; value: Param }
  | { kind: "word"; marker: Hex }
  | { kind: "dyn"; marker: Hex };

/** Whether a parameter is ABI-dynamic (mirrors the combinator's shape rules). */
export function isDynamicParam(p: AbiParameter): boolean {
  const suffix = p.type.match(/\[(\d*)\]$/);
  if (suffix) {
    if (suffix[1] === "") return true;
    return isDynamicParam({
      ...p,
      type: p.type.slice(0, -suffix[0].length),
    } as AbiParameter);
  }
  if (p.type === "bytes" || p.type === "string") return true;
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return components.some(isDynamicParam);
  }
  return false;
}

/** The head footprint of a parameter in 32-byte words (1 for dynamic
 *  values — their head word is an offset). */
function headWords(p: AbiParameter): number {
  if (isDynamicParam(p)) return 1;
  const suffix = p.type.match(/\[(\d+)\]$/);
  if (suffix) {
    return (
      Number(suffix[1]) *
      headWords({
        ...p,
        type: p.type.slice(0, -suffix[0].length),
      } as AbiParameter)
    );
  }
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return components.reduce((sum, c) => sum + headWords(c), 0);
  }
  return 1;
}

const SINGLE_WORD_ABI = /^(u?int\d*|address|bool|bytes32)$/;

/**
 * Encode a function call whose arguments may be live holes. Word holes must
 * be single-word static parameters; a dynamic hole must be the last
 * argument (its envelope is appended by the judge, so nothing may follow
 * it) — its head offset skips the envelope's own offset word, landing the
 * decoder on the length word (ABI decoding tolerates the loose prefix).
 */
export function buildCalldata(fnAbi: AbiFunction, specs: ArgSpec[]): Hex {
  const inputs = fnAbi.inputs;
  if (specs.length !== inputs.length) {
    throw new ErrorException(
      `${fnAbi.name} expects ${inputs.length} argument(s), got ${specs.length}`,
    );
  }
  const headSizes = inputs.map((p) => headWords(p) * 32);
  const headTotal = headSizes.reduce((a, b) => a + b, 0);

  let heads = "";
  let tails = "";
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const input = inputs[i];
    if (spec.kind === "word") {
      if (!SINGLE_WORD_ABI.test(input.type)) {
        throw new ErrorException(
          `a live call argument must fill a single-word parameter (uint/int, address, bool, bytes32); parameter ${i} of ${fnAbi.name} is ${input.type}`,
        );
      }
      heads += spec.marker.slice(2);
      continue;
    }
    if (spec.kind === "dyn") {
      if (!isDynamicParam(input)) {
        throw new ErrorException(
          `a dynamic live argument needs a dynamic parameter type; parameter ${i} of ${fnAbi.name} is ${input.type}`,
        );
      }
      if (i !== specs.length - 1) {
        throw new ErrorException(
          `a dynamic-typed live call argument must be the last argument of ${fnAbi.name} — the judge appends its runtime-sized value, so nothing can follow it`,
        );
      }
      // Point the head past the envelope's own offset word.
      heads += toWord(BigInt(headTotal + tails.length / 2 + 32)).slice(2);
      tails += spec.marker.slice(2);
      continue;
    }
    const encoded = encodeParams(
      [input],
      [spec.value as Param],
      `${fnAbi.name} argument ${i}`,
    ).slice(2);
    if (isDynamicParam(input)) {
      heads += toWord(BigInt(headTotal + tails.length / 2)).slice(2);
      tails += encoded.slice(64); // strip the single-value offset word
    } else {
      heads += encoded;
    }
  }
  return `${toFunctionSelector(fnAbi)}${heads}${tails}` as Hex;
}

// ---------------------------------------------------------------------------
//  Emission: markers -> construction entries
// ---------------------------------------------------------------------------

const EXECUTIONS_PARAM = {
  type: "tuple[]",
  components: [
    { name: "functionSig", type: "bytes4" },
    {
      name: "inputParams",
      type: "tuple[]",
      components: [
        { name: "paramType", type: "uint8" },
        { name: "fetcherType", type: "uint8" },
        { name: "paramData", type: "bytes" },
        {
          name: "constraints",
          type: "tuple[]",
          components: [
            { name: "constraintType", type: "uint8" },
            { name: "referenceData", type: "bytes" },
          ],
        },
      ],
    },
    {
      name: "outputParams",
      type: "tuple[]",
      components: [
        { name: "fetcherType", type: "uint8" },
        { name: "paramData", type: "bytes" },
      ],
    },
  ],
} as const;

function encodeBatchArg(entries: ComposableExecution[]): Hex {
  return encodeAbiParameters([EXECUTIONS_PARAM], [entries as never]);
}

/** All marker occurrences in `body` (hex without 0x), sorted by position. */
function findMarkers(
  reg: HoleRegistry,
  body: string,
): { pos: number; param: InputParam }[] {
  const found: { pos: number; param: InputParam }[] = [];
  const scan = (marker: string, param: InputParam) => {
    let from = 0;
    for (;;) {
      const pos = body.indexOf(marker, from);
      if (pos === -1) return;
      if (pos % 2 !== 0) {
        // hex nibble misalignment cannot be a real hole
        from = pos + 1;
        continue;
      }
      found.push({ pos: pos / 2, param });
      from = pos + marker.length;
    }
  };
  for (const [marker, param] of reg.words) scan(marker, param);
  if (reg.dyn) scan(reg.dyn.marker, reg.dyn.nav);
  return found.sort((a, b) => a.pos - b.pos);
}

/** Split a constructed call (selector ++ body-with-markers) into an entry:
 *  fixed spans become RAW_BYTES params, markers their registered fetchers. */
function entryFor(
  reg: HoleRegistry,
  assertions: Address,
  callHex: Hex,
): ComposableExecution {
  const body = callHex.slice(10).toLowerCase();
  const holes = findMarkers(reg, body);
  const params: InputParam[] = [targetParam(assertions)];
  let cursor = 0;
  for (const hole of holes) {
    if (hole.pos * 2 < cursor) {
      throw new ErrorException("overlapping live-argument holes");
    }
    if (hole.pos * 2 > cursor) {
      params.push(rawParam(`0x${body.slice(cursor, hole.pos * 2)}`));
    }
    params.push(hole.param);
    cursor = hole.pos * 2 + 64;
  }
  if (cursor < body.length) {
    params.push(rawParam(`0x${body.slice(cursor)}`));
  }
  return {
    functionSig: callHex.slice(0, 10) as Hex,
    inputParams: params,
    outputParams: [],
  };
}

/** `calc(Add, byteLen(nav), base)` — an affine word over the runtime size
 *  of the dynamic hole's envelope, spliced where an enclosing length or
 *  offset word depends on it. */
function affineWord(
  combinators: Address,
  nav: InputParam,
  base: bigint,
): InputParam {
  const byteLen = staticCallParam(combinators, encodeData("ByteLen", nav));
  return staticCallParam(
    combinators,
    encodeCalc("Add", byteLen, wordParam(base)),
  );
}

const pad32 = (n: number): number => Math.ceil(n / 32) * 32;

/**
 * Hand-rolled `assertParam(param)` calldata for the dynamic-hole case: the
 * envelope's runtime size shifts every enclosing length/offset word, so
 * those words are emitted as computed (affine) word holes instead of
 * build-time constants. Requires the compiler's canonical shape: a
 * STATIC_CALL param whose calldata carries the dyn marker in tail position.
 */
function encodeAssertParamCallDyn(
  reg: HoleRegistry,
  combinators: Address,
  param: InputParam,
): Hex {
  const dyn = reg.dyn!;
  const paramData = param.paramData.slice(2).toLowerCase();
  // encodeStaticCallData layout: [target][0x40][len_cd][calldata ++ pad]
  const markerAt = paramData.indexOf(dyn.marker);
  if (param.fetcherType !== 1 || markerAt < 96 * 2) {
    throw new ErrorException(
      "a dynamic-typed live argument is only supported in the outermost judged call of an assertion",
    );
  }
  const target = paramData.slice(0, 64);
  const buildLenCd = parseInt(paramData.slice(128, 192), 16);
  const calldataHex = paramData.slice(192, 192 + buildLenCd * 2);
  if (!calldataHex.endsWith(dyn.marker)) {
    throw new ErrorException(
      "a dynamic-typed live call argument must be the last argument of the judged call",
    );
  }
  // Runtime sizes: the 32-byte marker is replaced by the fetched envelope.
  const fixedLenCd = buildLenCd - 32; // + envLen at runtime
  const padding = "00".repeat(pad32(fixedLenCd) - fixedLenCd); // envLen is word-aligned
  const paramDataLen = 96 + pad32(fixedLenCd); // + envLen
  // paramData offset (0x80) + its length word + content ([target][0x40]
  // [len_cd][calldata ++ pad]) = where the constraints tuple[] starts.
  const constraintsAt = 0x80 + 32 + 96 + pad32(fixedLenCd); // + envLen (rel. struct start)

  const constraints = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "constraintType", type: "uint8" },
          { name: "referenceData", type: "bytes" },
        ],
      },
    ],
    [param.constraints as never],
  ).slice(66); // strip the single-value offset word

  const lenCdHole = wordHole(
    reg,
    affineWord(combinators, dyn.nav, BigInt(fixedLenCd)),
  );
  const paramDataLenHole = wordHole(
    reg,
    affineWord(combinators, dyn.nav, BigInt(paramDataLen)),
  );
  const constraintsAtHole = wordHole(
    reg,
    affineWord(combinators, dyn.nav, BigInt(constraintsAt)),
  );

  return (ASSERT_PARAM_SELECTOR +
    toWord(0x20n).slice(2) + // offset to the InputParam struct
    toWord(BigInt(param.paramType)).slice(2) +
    toWord(BigInt(param.fetcherType)).slice(2) +
    toWord(0x80n).slice(2) + // paramData offset (rel. struct start)
    constraintsAtHole.slice(2) +
    paramDataLenHole.slice(2) +
    target +
    toWord(0x40n).slice(2) +
    lenCdHole.slice(2) +
    calldataHex.slice(0, -64) + // fixed calldata prefix (marker stripped)
    dyn.marker + // the envelope splices here
    padding +
    constraints) as Hex;
}

/**
 * Emit the final assertion action for a compiled InputParam: a plain
 * `assertParam` when it is hole-free, otherwise the recursive
 * `assertComposable` construction — one entry per nesting level, the
 * innermost constructing `assertParam(param)` and each additional level
 * constructing `assertComposable(innerBatch)` around it.
 */
export async function emitAssertion(
  module: Module,
  reg: HoleRegistry,
  combinators: Address,
  param: InputParam,
  message = "",
): Promise<TransactionAction> {
  const assertions = await resolveAssertionsContract(module);
  const direct = encodeAssertParam(param, message);
  if (!hasMarkers(reg, direct)) {
    return { to: assertions, data: direct, readOnly: true };
  }

  let callHex: Hex;
  if (reg.dyn && param.paramData.toLowerCase().includes(reg.dyn.marker)) {
    callHex = encodeAssertParamCallDyn(reg, combinators, param);
  } else {
    if (reg.dyn) {
      throw new ErrorException(
        "a dynamic-typed live argument is only supported in the outermost judged call of an assertion",
      );
    }
    callHex =
      `${ASSERT_PARAM_SELECTOR}${encodeAssertParam(param).slice(10)}` as Hex;
  }

  for (;;) {
    const entry = entryFor(reg, assertions, callHex);
    const batchArg = encodeBatchArg([entry]);
    if (!hasMarkers(reg, batchArg)) {
      return {
        to: assertions,
        data: encodeAssertComposable([entry], message),
        readOnly: true,
      };
    }
    callHex = `${ASSERT_COMPOSABLE_SELECTOR}${batchArg.slice(2)}` as Hex;
  }
}
