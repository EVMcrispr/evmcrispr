import type { AbiFunction } from "viem";
import { parseAbiItem } from "viem";
import { HelperFunctionError } from "../../../errors";
import type { HelperFunction } from "../../../types";
import {
  ComparisonType,
  checkArgsLength,
  encodeCalldata,
} from "../../../utils";
import type { Std } from "../Std";

export const abiEncodeCall: HelperFunction<Std> = async (
  _,
  h,
  { interpretNodes },
): Promise<string> => {
  checkArgsLength(h, {
    type: ComparisonType.Greater,
    minValue: 1,
  });

  const [signature, ...params] = await interpretNodes(h.args);

  let fnABI: AbiFunction;
  try {
    const fullSignature = signature.startsWith("function")
      ? signature
      : `function ${signature}`;
    fnABI = parseAbiItem(fullSignature) as AbiFunction;
  } catch (_err) {
    throw new HelperFunctionError(
      h,
      `invalid function signature: "${signature}"`,
    );
  }

  return encodeCalldata(fnABI, params);
};
