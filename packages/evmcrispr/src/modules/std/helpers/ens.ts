import { createPublicClient, http } from "viem";

import { mainnet } from "viem/chains";
import { HelperFunctionError } from "../../../errors";
import type { HelperFunction } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import type { Std } from "../Std";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

function _ens(name: string) {
  return mainnetClient.getEnsAddress({ name });
}

export const ens: HelperFunction<Std> = async (
  _,
  h,
  { interpretNodes },
): Promise<string> => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [name] = await interpretNodes(h.args);
  const addr = await _ens(name);
  if (!addr) {
    throw new HelperFunctionError(h, `ENS name ${name} not found`);
  }
  return addr;
};
