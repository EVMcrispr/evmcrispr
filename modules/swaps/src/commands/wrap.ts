import {
  chainLabel,
  defineCommand,
  ErrorNotFound,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import { isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type Swaps from "..";
import { WRAPPED_NATIVE } from "../addresses";

export default defineCommand<Swaps>({
  smartSupport: { kind: "runtime" },
  name: "wrap",
  description:
    "Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...).",
  args: [
    {
      name: "amount",
      runtime: true,
      type: "number",
      description: "Native amount to wrap, in base units (wei)",
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
    return [
      encodeAction(wrapped, "deposit()", [], {
        value: isRuntimeValue(amount) ? amount : Num(amount).toBigInt(),
      }),
    ];
  },
});
