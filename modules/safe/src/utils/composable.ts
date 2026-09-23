import {
  COMPOSABLE_EXECUTOR_ABI,
  COMPOSABLE_STORAGE_ADDRESS,
  CORE_ABI,
  CORE_ADDRESS,
  FETCHER_TYPE,
  type InputParam,
  OUTPUT_FETCHER_TYPE,
  type OutputParam,
  PARAM_TYPE,
} from "@evmcrispr/sdk/onchain";
import {
  type Address,
  concatHex,
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Hex,
  hexToBigInt,
  isAddressEqual,
  size,
} from "viem";

/** A call the ERC-8211 executor makes from the Safe, as far as the calldata
 *  fixes it. `runtime` names the parts resolved only at execution time. */
export interface ComposableCall {
  to: Address;
  value: bigint;
  data: Hex;
  runtime: ("value" | "data")[];
  /** Runs only when a runtime condition holds. */
  conditional: boolean;
}

const ZERO_WORD = `0x${"00".repeat(32)}`;

/** A parameter's value when the calldata fixes it: a literal, or a literal
 *  behind a runtime condition whose other branch is the empty fallback that
 *  skips the call. */
function literal(
  param: Pick<InputParam, "fetcherType" | "paramData">,
): { value: Hex; conditional: boolean } | undefined {
  if (param.fetcherType === FETCHER_TYPE.RawBytes)
    return { value: param.paramData, conditional: false };
  if (param.fetcherType !== FETCHER_TYPE.StaticCall) return undefined;
  try {
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    );
    if (!isAddressEqual(target, CORE_ADDRESS)) return undefined;
    const { functionName, args } = decodeFunctionData({ abi: CORE_ABI, data });
    if (functionName !== "cond") return undefined;
    const [, then_, else_] = args as unknown as InputParam[];
    if (
      else_.fetcherType !== FETCHER_TYPE.RawBytes ||
      (else_.paramData !== "0x" && else_.paramData !== ZERO_WORD)
    )
      return undefined;
    const inner = literal(then_);
    return inner && { value: inner.value, conditional: true };
  } catch {
    return undefined;
  }
}

/** Outputs write to the executor's storage contract, and nowhere else. */
function checkOutput(output: OutputParam): void {
  const [, storage] =
    output.fetcherType === OUTPUT_FETCHER_TYPE.ExecResult
      ? decodeAbiParameters(
          [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }],
          output.paramData,
        )
      : output.fetcherType === OUTPUT_FETCHER_TYPE.StaticCall
        ? decodeAbiParameters(
            [
              { type: "uint256" },
              { type: "address" },
              { type: "bytes" },
              { type: "address" },
              { type: "bytes32" },
            ],
            output.paramData,
          ).slice(3)
        : [];
  if (
    !storage ||
    !isAddressEqual(storage as Address, COMPOSABLE_STORAGE_ADDRESS)
  )
    throw new Error("an output that does not write to the executor's storage");
}

/**
 * The calls an `executeComposableDelegateCall` makes from the Safe. Each
 * execution calls its target with the selector followed by its calldata
 * parameters; one without parameters only reads into storage. Throws, with
 * the reason, when a call cannot be reviewed from the calldata: a target
 * resolved at execution time, or runtime arguments in a call to the Safe
 * itself, which could change its owners, modules or guards unseen.
 */
export function decodeComposableCalls(
  safe: Address,
  data: Hex,
): ComposableCall[] {
  const { functionName, args } = decodeFunctionData({
    abi: COMPOSABLE_EXECUTOR_ABI,
    data,
  });
  if (functionName !== "executeComposableDelegateCall")
    throw new Error(`${functionName} is not the delegatecall route`);
  const calls: ComposableCall[] = [];
  for (const execution of args[0]) {
    for (const output of execution.outputParams) checkOutput(output);
    const of = (type: number) =>
      execution.inputParams.filter((p) => p.paramType === type);
    const [targets, values, callData] = [
      of(PARAM_TYPE.Target),
      of(PARAM_TYPE.Value),
      of(PARAM_TYPE.CallData),
    ];
    if (targets.length === 0) {
      if (values.length || callData.length)
        throw new Error("an execution without a target");
      continue;
    }
    if (targets.length > 1 || values.length > 1)
      throw new Error("an execution with several targets or values");
    const target = literal(targets[0]);
    if (
      !target ||
      size(target.value) !== 32 ||
      hexToBigInt(target.value) >> 160n !== 0n
    )
      throw new Error("a call target resolved at execution time");
    const to = getAddress(`0x${target.value.slice(-40)}`);
    const runtime: ComposableCall["runtime"] = [];
    let conditional = target.conditional;
    let value = 0n;
    if (values.length) {
      const fixed = literal(values[0]);
      if (fixed && size(fixed.value) === 32) {
        value = hexToBigInt(fixed.value);
        conditional ||= fixed.conditional;
      } else runtime.push("value");
    }
    const parts = callData.map(literal);
    let callDataHex: Hex = execution.functionSig;
    if (parts.every((p) => p !== undefined)) {
      callDataHex = concatHex([
        execution.functionSig,
        ...parts.map((p) => p!.value),
      ]);
      conditional ||= parts.some((p) => p!.conditional);
    } else {
      if (isAddressEqual(to, safe))
        throw new Error(
          "a call to the Safe itself with arguments resolved at execution time",
        );
      runtime.push("data");
    }
    calls.push({ to, value, data: callDataHex, runtime, conditional });
  }
  return calls;
}
