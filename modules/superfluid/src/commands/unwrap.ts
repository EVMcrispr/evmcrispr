import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superTokenAbi } from "../abis";
import { requireCore } from "../utils/protocol";
import {
  getUnderlyingToken,
  isNativeSuperToken,
  isPureSuperToken,
  resolveSuperToken,
} from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "unwrap",
  description:
    "Unwrap a SuperToken back to its underlying token (DAIx to DAI, xDAIx to native xDAI...). The amount is in the SuperToken's 18-decimal base units; pass `max` to unwrap the full balance. Keep some balance if streams are still running — unwrapping below the buffer makes them liquidatable.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
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

    let parsed: bigint;
    if (amount === "max") {
      const owner = await module.getConnectedAccount(true);
      const client = await module.getClient();
      parsed = (await client.readContract({
        address: superToken,
        abi: superTokenAbi as Abi,
        functionName: "balanceOf",
        args: [owner],
      })) as bigint;
      if (parsed <= 0n) {
        throw new ErrorException("nothing to unwrap");
      }
    } else {
      let value: bigint;
      try {
        value = Num(amount as string).toBigInt();
      } catch {
        throw new ErrorException(
          `<amount> must be a number or the keyword \`max\`, got ${amount}`,
        );
      }
      if (value <= 0n) {
        throw new ErrorException("<amount> must be greater than zero");
      }
      parsed = value;
    }

    const chainId = await module.getChainId();
    if (isNativeSuperToken(chainId, superToken)) {
      return [
        encodeAction(superToken, "downgradeToETH(uint256)", [
          Num.fromBigInt(parsed),
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
      encodeAction(superToken, "downgrade(uint256)", [Num.fromBigInt(parsed)]),
    ];
  },
});
