import {
  chainLabel,
  defineCommand,
  ErrorNotFound,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type Swaps from "..";
import { WRAPPED_NATIVE } from "../addresses";

export default defineCommand<Swaps>({
  name: "unwrap",
  description:
    "Unwrap the canonical wrapped-native token back into the native token (WETH to ETH, WXDAI to xDAI...).",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Wrapped amount to unwrap, in base units (wei)",
    },
  ],
  async run(module, { amount }) {
    const chainId = await module.getChainId();
    const wrapped = WRAPPED_NATIVE[chainId];
    if (!wrapped) {
      throw new ErrorNotFound(
        `no wrapped-native token known for ${chainLabel(chainId)}`,
      );
    }
    return [encodeAction(wrapped, "withdraw(uint256)", [Num(amount)])];
  },
});
