import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import {
  amountParam,
  getSmartCompileContext,
  isRuntimeValue,
  type SmartAmount,
  smartRead,
} from "@evmcrispr/sdk/onchain";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superTokenAbi } from "../abis";
import { requireCore } from "../utils/protocol";
import { parseAmount } from "../utils/rate";
import {
  getUnderlyingToken,
  isNativeSuperToken,
  isPureSuperToken,
  resolveSuperToken,
} from "../utils/supertoken";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "unwrap",
  description:
    "Unwrap a SuperToken back to its underlying token (DAIx to DAI, xDAIx to native xDAI...). The amount is in the SuperToken's 18-decimal base units; pass `max` to unwrap the full balance. Keep some balance if streams are still running — unwrapping below the buffer makes them liquidatable.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      runtime: true,
      description:
        "SuperToken amount to unwrap in base units (18 decimals), or the keyword `max` for the full balance",
    },
    { name: "of", type: "command", description: "Keyword `of`" },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
    of: () => [fieldItem("of")],
  },
  async run(module, { amount, of, token }) {
    if (of !== "of") {
      throw new ErrorException(`expected keyword "of", got "${of}"`);
    }
    await requireCore(module);
    const superToken = await resolveSuperToken(module, token);

    let parsed: SmartAmount;
    if (amount === "max") {
      const owner = await module.getSender();
      parsed = getSmartCompileContext(module)
        ? smartRead(
            module,
            superToken,
            "balanceOf(address) returns (uint256)",
            [owner],
          )
        : ((await (
            await module.getClient()
          ).readContract({
            address: superToken,
            abi: superTokenAbi as Abi,
            functionName: "balanceOf",
            args: [owner],
          })) as bigint);
      if (!isRuntimeValue(parsed) && parsed <= 0n)
        throw new ErrorException("nothing to unwrap");
    } else parsed = parseAmount(amount, "<amount>", module);

    const chainId = await module.getChainId();
    if (isNativeSuperToken(chainId, superToken)) {
      return [
        encodeAction(superToken, "downgradeToETH(uint256)", [
          amountParam(parsed),
        ]),
      ];
    }

    const underlying = await getUnderlyingToken(module, superToken);
    if (isPureSuperToken(underlying)) {
      throw new ErrorException(
        `${superToken} is a pure SuperToken with no underlying token to unwrap`,
      );
    }
    return [
      encodeAction(superToken, "downgrade(uint256)", [amountParam(parsed)]),
    ];
  },
});
