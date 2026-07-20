import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import type Giveth from "..";
import { DONATION_HANDLER, GIVETH_TIP_SLUG } from "../addresses";
import { parseAmount, tipAmount } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { fetchProject, getRecipientAddress } from "../utils/graphql";

export default defineCommand<Giveth>({
  name: "donate",
  description:
    "Donate a token to a Giveth project through the Giveth DonationHandler, approving it automatically when needed. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token. Wrap several donates in std batch to donate to many projects in one transaction.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Donation amount in token base units",
    },
    {
      name: "token",
      type: "address",
      description:
        "Token to donate (use @token(SYM); the native token resolves to the zero address)",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "slug", type: "string", description: "Giveth project URL slug" },
  ],
  opts: [
    {
      name: "tip",
      type: "number",
      description:
        "Extra donation to Giveth itself as a percentage of the amount (0-100), added on top and sent in the same transaction",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { amount, token, to, slug }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await module.getChainId();
    const handler = DONATION_HANDLER[chainId];
    if (!handler) {
      throw new ErrorException(
        `the Giveth donation handler is not deployed on chain ${chainId}`,
      );
    }

    const donation = parseAmount(amount);
    const tip = opts.tip === undefined ? 0n : tipAmount(donation, opts.tip);
    const total = donation + tip;

    const project = await fetchProject(module, slug);
    const recipients: Address[] = [getRecipientAddress(project, chainId)];
    const amounts = [donation];
    if (tip > 0n) {
      const tipProject = await fetchProject(module, GIVETH_TIP_SLUG);
      recipients.push(getRecipientAddress(tipProject, chainId));
      amounts.push(tip);
    }
    const datas = recipients.map(() => "0x");

    if (token === zeroAddress) {
      const action =
        recipients.length === 1
          ? encodeAction(
              handler,
              "donateETH(address,uint256,bytes)",
              [recipients[0]!, Num.fromBigInt(donation), "0x"],
              { value: donation },
            )
          : encodeAction(
              handler,
              "donateManyETH(uint256,address[],uint256[],bytes[])",
              [
                Num.fromBigInt(total),
                recipients,
                amounts.map(Num.fromBigInt),
                datas,
              ],
              { value: total },
            );
      return [action];
    }

    const skipApprove =
      opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
    const owner = await module.getConnectedAccount(true);
    const approvals = skipApprove
      ? []
      : await buildApprovalActions(module, token, owner, handler, total);

    const action =
      recipients.length === 1
        ? encodeAction(handler, "donateERC20(address,address,uint256,bytes)", [
            token,
            recipients[0]!,
            Num.fromBigInt(donation),
            "0x",
          ])
        : encodeAction(
            handler,
            "donateManyERC20(address,uint256,address[],uint256[],bytes[])",
            [
              token,
              Num.fromBigInt(total),
              recipients,
              amounts.map(Num.fromBigInt),
              datas,
            ],
          );
    return [...approvals, action];
  },
});
