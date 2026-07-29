import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Lending from "..";
import { requireRead, resolveAdapter } from "../adapters/registry";
import type { RateSide } from "../adapters/types";
import { formatFraction } from "../utils/rates";

export default defineHelper<Lending>({
  name: "apy",
  batchable: false,
  description:
    "Current APY of a lending-market reserve as a decimal fraction (2.04% -> 0.0204). Pass `supply` for the deposit rate or `borrow` for the variable borrow rate.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "address",
      description: "Reserve token to inspect (use @token(SYM))",
    },
    {
      name: "side",
      type: "string",
      description:
        "`supply` for the deposit rate, `borrow` for the borrow rate",
    },
    {
      name: "adapter",
      type: "lending-adapter",
      optional: true,
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
  ],
  async run(module, { token, side, adapter }) {
    if (side !== "supply" && side !== "borrow") {
      throw new ErrorException(
        `<side> must be \`supply\` or \`borrow\`, got ${side}`,
      );
    }
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const read = requireRead(resolved, "apy");
    return formatFraction(await read(module, chainId, token, side as RateSide));
  },
});
