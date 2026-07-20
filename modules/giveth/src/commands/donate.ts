import type { Action, TransactionAction } from "@evmcrispr/sdk";
import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { formatUnits, parseAbi, zeroAddress } from "viem";
import type Giveth from "..";
import { DONATION_HANDLER, GIVETH_TIP_SLUG } from "../addresses";
import { parseAmount, tipAmount } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { givethLogin } from "../utils/auth";
import type { DonationRecord } from "../utils/graphql";
import {
  fetchProject,
  getRecipientAddress,
  recordDonation,
} from "../utils/graphql";

const erc20MetaAbi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

function parseAmounts(value: unknown, count: number): bigint[] {
  if (Array.isArray(value)) {
    if (value.length !== count) {
      throw new ErrorException(
        `<amounts> length (${value.length}) does not match <projects> length (${count})`,
      );
    }
    return value.map(parseAmount);
  }
  const amount = parseAmount(value);
  return Array.from({ length: count }, () => amount);
}

async function executeTx(
  actionCallback: (action: Action) => Promise<unknown>,
  action: TransactionAction,
  chainId: number,
): Promise<string> {
  action.chainId = chainId;
  const result = await actionCallback(action);
  const hash =
    typeof result === "string" ? result : (result as any)?.transactionHash;
  if (typeof hash !== "string") {
    throw new ErrorException(
      "couldn't obtain the transaction hash from the wallet",
    );
  }
  return hash;
}

export default defineCommand<Giveth>({
  name: "donate",
  description:
    "Donate to Giveth projects and record the donation in Giveth's database (project totals, GIVbacks). A single project gets a direct wallet transfer; several projects ([amounts] to [slugs]) donate through the DonationHandler contract in one transaction. Signs you in to Giveth (SIWE) and sends the transactions immediately to report their hashes, so it cannot be batched. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token.",
  batchable: false,
  args: [
    {
      name: "amount",
      type: ["array", "number"],
      description:
        "Donation amount in token base units, or one amount per project (a single amount with several projects donates that amount to each)",
    },
    {
      name: "token",
      type: "address",
      description:
        "Token to donate (use @token(SYM); the native token resolves to the zero address)",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "projects",
      type: ["array", "string"],
      description: "Giveth project URL slug, or several slugs",
    },
  ],
  opts: [
    {
      name: "tip",
      type: "number",
      description:
        "Extra donation to Giveth itself as a percentage of the total amount (0-100), added on top",
    },
    {
      name: "anonymous",
      type: "bool",
      description: "Hide your identity on the recorded donation",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { amount, token, to, projects }, { opts, interpreters }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }

    const viaContract = Array.isArray(projects);
    const slugs = (viaContract ? projects : [projects]) as string[];
    if (slugs.length === 0) {
      throw new ErrorException("<projects> must not be empty");
    }
    for (const slug of slugs) {
      if (typeof slug !== "string" || !slug) {
        throw new ErrorException(
          `<projects> must contain project slugs, got ${slug}`,
        );
      }
    }
    if (new Set(slugs).size !== slugs.length) {
      throw new ErrorException("<projects> contains duplicate slugs");
    }
    if (!viaContract && Array.isArray(amount)) {
      throw new ErrorException(
        "<amount> must be a single number when donating to a single project",
      );
    }
    const amounts = parseAmounts(amount, slugs.length);
    const total = amounts.reduce((a, b) => a + b, 0n);
    const tip = opts.tip === undefined ? 0n : tipAmount(total, opts.tip);
    const anonymous =
      opts.anonymous !== undefined && coerceBoolean(opts.anonymous);

    const chainId = await module.getChainId();
    const handler = DONATION_HANDLER[chainId];
    if (viaContract && !handler) {
      throw new ErrorException(
        `the Giveth donation handler is not deployed on chain ${chainId}`,
      );
    }

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "donate requires an execution context with wallet access",
      );
    }

    const boosted = await Promise.all(
      slugs.map((slug) => fetchProject(module, slug)),
    );
    const recipients = boosted.map((p) => getRecipientAddress(p, chainId));
    const tipProject =
      tip > 0n ? await fetchProject(module, GIVETH_TIP_SLUG) : undefined;
    const tipRecipient = tipProject
      ? getRecipientAddress(tipProject, chainId)
      : undefined;

    const native = token === zeroAddress;
    let tokenSymbol: string;
    let tokenDecimals: number;
    if (native) {
      const chain = await module.getChain();
      tokenSymbol = chain?.nativeCurrency?.symbol ?? "ETH";
      tokenDecimals = chain?.nativeCurrency?.decimals ?? 18;
    } else {
      const client = await module.getClient();
      [tokenSymbol, tokenDecimals] = await Promise.all([
        client.readContract({
          address: token as Address,
          abi: erc20MetaAbi,
          functionName: "symbol",
        }),
        client.readContract({
          address: token as Address,
          abi: erc20MetaAbi,
          functionName: "decimals",
        }),
      ]);
    }
    const human = (wei: bigint) => Number(formatUnits(wei, tokenDecimals));

    // Inside a simulation the transactions only exist on the fork — skip the
    // sign-in and never report them to Giveth's database.
    const simulation = interpreters.simulation === true;

    // Sign in before moving funds so a failed login aborts the donation.
    const jwt = simulation
      ? undefined
      : await givethLogin(module, actionCallback);

    let txHash: string;
    let tipTxHash: string | undefined;
    if (!viaContract) {
      const recipient = recipients[0]!;
      const sendTo = (dest: Address, value: bigint): TransactionAction =>
        native
          ? { to: dest, value }
          : encodeAction(token, "transfer(address,uint256)", [
              dest,
              Num.fromBigInt(value),
            ]);
      txHash = await executeTx(
        actionCallback,
        sendTo(recipient, total),
        chainId,
      );
      if (tipRecipient) {
        tipTxHash = await executeTx(
          actionCallback,
          sendTo(tipRecipient, tip),
          chainId,
        );
      }
    } else {
      const allRecipients = [...recipients];
      const allAmounts = [...amounts];
      if (tipRecipient) {
        allRecipients.push(tipRecipient);
        allAmounts.push(tip);
      }
      const grandTotal = total + tip;
      const datas = allRecipients.map(() => "0x");

      const skipApprove =
        opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
      if (!native && !skipApprove) {
        const owner = await module.getConnectedAccount(true);
        const approvals = await buildApprovalActions(
          module,
          token,
          owner,
          handler,
          grandTotal,
        );
        for (const approval of approvals) {
          await executeTx(
            actionCallback,
            approval as TransactionAction,
            chainId,
          );
        }
      }

      const action = native
        ? allRecipients.length === 1
          ? encodeAction(
              handler,
              "donateETH(address,uint256,bytes)",
              [allRecipients[0]!, Num.fromBigInt(allAmounts[0]!), "0x"],
              { value: grandTotal },
            )
          : encodeAction(
              handler,
              "donateManyETH(uint256,address[],uint256[],bytes[])",
              [
                Num.fromBigInt(grandTotal),
                allRecipients,
                allAmounts.map(Num.fromBigInt),
                datas,
              ],
              { value: grandTotal },
            )
        : allRecipients.length === 1
          ? encodeAction(
              handler,
              "donateERC20(address,address,uint256,bytes)",
              [token, allRecipients[0]!, Num.fromBigInt(allAmounts[0]!), "0x"],
            )
          : encodeAction(
              handler,
              "donateManyERC20(address,uint256,address[],uint256[],bytes[])",
              [
                token,
                Num.fromBigInt(grandTotal),
                allRecipients,
                allAmounts.map(Num.fromBigInt),
                datas,
              ],
            );
      txHash = await executeTx(actionCallback, action, chainId);
      tipTxHash = tipRecipient ? txHash : undefined;
    }

    if (jwt === undefined) {
      module.context.log(
        "simulation: donation not recorded in Giveth's database",
      );
      return [];
    }

    const records: DonationRecord[] = boosted.map((project, i) => ({
      txHash,
      chainId,
      amount: human(amounts[i]!),
      tokenSymbol,
      tokenAddress: token as Address,
      projectId: project.id,
      anonymous,
      useDonationBox: tipProject ? true : undefined,
    }));
    if (tipProject && tipTxHash) {
      records.push({
        txHash: tipTxHash,
        chainId,
        amount: human(tip),
        tokenSymbol,
        tokenAddress: token as Address,
        projectId: tipProject.id,
        anonymous,
        useDonationBox: true,
        relevantDonationTxHash: tipTxHash !== txHash ? txHash : undefined,
      });
    }

    const failures: string[] = [];
    for (const record of records) {
      try {
        await recordDonation(module, jwt, record);
      } catch (err: any) {
        failures.push(err?.message ?? String(err));
      }
    }
    if (failures.length > 0) {
      throw new ErrorException(
        `the donation was sent on-chain (${txHash}) but recording ${failures.length} donation(s) in Giveth's database failed: ${failures[0]}`,
      );
    }

    return [];
  },
});
