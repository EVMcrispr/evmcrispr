import {
  defineCommand,
  ErrorNotFound,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type Swaps from "..";
import { WRAPPED_NATIVE } from "../addresses";

export default defineCommand<Swaps>({
  name: "wrap",
  description:
    "Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...).",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Native amount to wrap, in base units (wei)",
    },
  ],
  async run(module, { amount }) {
    const chainId = await module.getChainId();
    const wrapped = WRAPPED_NATIVE[chainId];
    if (!wrapped) {
      throw new ErrorNotFound(
        `no wrapped-native token known for chain ${chainId}`,
      );
    }
    return [
      encodeAction(wrapped, "deposit()", [], {
        value: Num(amount).toBigInt(),
      }),
    ];
  },
});
