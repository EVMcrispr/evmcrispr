import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { withApproval } from "../utils/plan";
import { requireCore } from "../utils/protocol";
import { parseAmount } from "../utils/rate";
import {
  getUnderlyingToken,
  isNativeSuperToken,
  isPureSuperToken,
  resolveSuperToken,
  toSuperTokenAmount,
} from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "wrap",
  description:
    "Wrap an underlying token into its SuperToken (DAI to DAIx, native xDAI to xDAIx...), approving the SuperToken automatically when needed. The amount is in the underlying token's base units (e.g. 100e6 for 100 USDC); SuperTokens themselves are always 18 decimals.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to wrap, in the underlying token's base units",
    },
    { name: "into", type: "command", description: "Keyword `into`" },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
  ],
  opts: [
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: { into: () => [fieldItem("into")] },
  async run(module, { amount, into, token }, { opts }) {
    if (into !== "into") {
      throw new ErrorException(`expected keyword "into", got "${into}"`);
    }
    const chainId = await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const parsed = parseAmount(amount);

    if (isNativeSuperToken(chainId, superToken)) {
      return [
        encodeAction(superToken, "upgradeByETH()", [], { value: parsed }),
      ];
    }

    const underlying = await getUnderlyingToken(module, superToken);
    if (isPureSuperToken(underlying)) {
      throw new ErrorException(
        `${superToken} is a pure SuperToken with no underlying token to wrap`,
      );
    }

    const owner = await module.getConnectedAccount(true);
    // upgrade() takes the 18-decimal SuperToken amount but pulls the
    // equivalent underlying amount, which is what the allowance covers.
    const superAmount = await toSuperTokenAmount(module, underlying, parsed);
    const action = encodeAction(superToken, "upgrade(uint256)", [
      Num.fromBigInt(superAmount),
    ]);
    return withApproval(
      module,
      [action],
      underlying,
      owner,
      superToken,
      parsed,
      opts,
    );
  },
});
