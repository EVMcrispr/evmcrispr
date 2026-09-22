import type { Module, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException, getEncodedCall } from "@evmcrispr/sdk";
import {
  byteLenParamOf,
  canonicalBytesParam,
  concatenateResolved,
  getSmartCompileContext,
  guardAbiInteger,
  type InputParam,
  isRuntimeValue,
  type RuntimeValue,
  rawParam,
  runtimeValue,
  smartFunctionData,
  smartValueParam,
  toWord,
  unwrapBytesParam,
  wordPartParam,
} from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { encodeAbiParameters, parseAbiParameters } from "viem";

const CALLSCRIPT_ID = "0x00000001";

/**
 * A call script action.
 */
export interface CallScriptAction {
  /**
   * The action's target.
   */
  to: Address;
  /**
   * The action's calldata.
   */
  data: `0x${string}`;
}

interface Segment {
  segment: CallScriptAction;
  scriptLeft: string;
}

function decodeSegment(script: string): Segment {
  // Get address
  const to: Address = `0x${script.substring(0, 40)}`;
  script = script.substring(40);

  // Get data
  const dataLength = parseInt(`0x${script.substring(0, 8)}`, 16) * 2;
  script = script.substring(8);
  const data: `0x${string}` = `0x${script.substring(0, dataLength)}`;

  // Return rest of script for processing
  script = script.substring(dataLength);

  return {
    segment: {
      to,
      data,
    },
    scriptLeft: script,
  };
}

/**
 * Checks whether a EVMScript bytes string is a call script.
 */
export function isCallScript(script: string): boolean {
  // Get script identifier (0x prefix + bytes4)
  const scriptId = script.substring(0, 10);
  return scriptId === CALLSCRIPT_ID;
}

/**
 * Decode a call script bytes string into its actions.
 *
 * Will return an array containing objects with:
 *
 *  - `to`: to address
 *  - `data`: call data
 *
 */
export function decodeCallScript(script: string): CallScriptAction[] {
  if (!isCallScript(script)) {
    throw new Error(`Not a call script: ${script}`);
  }

  let scriptData = script.substring(10);
  const segments = [];

  while (scriptData.length > 0) {
    const { segment, scriptLeft } = decodeSegment(scriptData);
    segments.push(segment);
    scriptData = scriptLeft;
  }
  return segments;
}

/**
 * Encode a call script
 *
 * Example:
 *
 * input:
 * [
 *  { to: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, data: 0x11111111 },
 *  { to: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, data: 0x2222222222 }
 * ]
 *
 * output:
 * 0x00000001
 *   aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000411111111
 *   bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb000000052222222222
 *
 *
 * @param {Array<CallScriptAction>} actions
 * @returns {string}
 */
export function encodeCallScript(actions: CallScriptAction[]): string {
  return actions.reduce((script: string, { to, data }) => {
    const address: Address = encodeAbiParameters(
      parseAbiParameters(["address"]),
      [to as `0x${string}`],
    );
    const dataLength = encodeAbiParameters(parseAbiParameters(["uint256"]), [
      BigInt((data.length - 2) / 2),
    ]);

    return script + address.slice(26) + dataLength.slice(58) + data.slice(2);
  }, CALLSCRIPT_ID);
}

/** The same CallsScript layout with typed execution-time targets and calldata. */
export function encodeSmartCallScript(
  module: Module,
  actions: TransactionAction[],
): string | RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) return encodeCallScript(actions as CallScriptAction[]);
  const parts: InputParam[] = [rawParam("0x00000001")];
  for (const action of actions) {
    if (
      action.operation === 1 ||
      (action.value !== undefined && action.value !== 0n)
    )
      throw new ErrorException(
        "CallsScript cannot represent delegatecalls or per-call native value",
      );
    const call = getEncodedCall(action);
    const target = call?.target ?? action.to;
    if (!target) throw new ErrorException("CallsScript requires a target");
    const data = call
      ? smartFunctionData(module, {
          abi: [call.abi],
          functionName: call.abi.name,
          args: call.args,
        })
      : (action.data ?? "0x");
    parts.push(
      unwrapBytesParam(
        ctx,
        wordPartParam(
          ctx,
          smartValueParam(ctx, { type: "address" }, target),
          12n,
          20n,
        ),
      ),
    );
    const length = isRuntimeValue(data)
      ? byteLenParamOf(ctx, data.operand.param)
      : rawParam(toWord(BigInt((data.length - 2) / 2)));
    parts.push(
      unwrapBytesParam(
        ctx,
        wordPartParam(
          ctx,
          guardAbiInteger(ctx, length, "Uint", "uint32"),
          28n,
          4n,
        ),
      ),
    );
    parts.push(
      isRuntimeValue(data)
        ? unwrapBytesParam(ctx, data.operand.param)
        : rawParam(data as `0x${string}`),
    );
  }
  return runtimeValue(
    canonicalBytesParam(ctx, concatenateResolved(ctx, parts)),
    { type: "bytes" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
  );
}
