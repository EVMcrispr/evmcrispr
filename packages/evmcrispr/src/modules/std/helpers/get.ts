import { isAddress, parseAbiItem } from "viem";

import { ErrorException } from "../../../errors";
import type { HelperFunction } from "../../../types";
import {
  ComparisonType,
  SIGNATURE_REGEX,
  checkArgsLength,
} from "../../../utils";
import type { Std } from "../Std";

export const get: HelperFunction<Std> = async (
  module,
  h,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(h, { type: ComparisonType.Greater, minValue: 2 });

  const [addressNode, abiNode, ...rest] = h.args;
  const [address, abi, params] = await Promise.all([
    interpretNode(addressNode),
    interpretNode(abiNode, { treatAsLiteral: true }),
    interpretNodes(rest),
  ]);

  if (!isAddress(address)) {
    throw new ErrorException(
      `expected a valid target address, but got "${address}"`,
    );
  }

  const [body, returns, index] = abi.split(":");

  if (!SIGNATURE_REGEX.test(body)) {
    throw new ErrorException(
      `expected a valid function signature, but got "${abi}"`,
    );
  }

  const client = await module.getClient();
  const result = await client.readContract({
    address,
    abi: [parseAbiItem(`function ${body} external view returns ${returns}`)],
    functionName: body.split("(")[0],
    args: params,
  });

  return index ? result[index] : result;
};
