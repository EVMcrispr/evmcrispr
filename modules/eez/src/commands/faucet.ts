import { chainLabel, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { createWalletClient, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type Eez from "..";
import { EEZ_CHAINS } from "../constants";

const DEFAULT_AMOUNT = parseEther("0.1");

export default defineCommand<Eez>({
  name: "faucet",
  batchable: false,
  description:
    "Send devnet ETH to an account from the EEZ devnet's pre-funded faucet key, so a fresh wallet can pay for gas. The faucet signs the transfer itself; nothing is asked of the connected wallet.",
  args: [
    {
      name: "recipient",
      type: "address",
      optional: true,
      description: "Account to fund (defaults to the connected account)",
    },
  ],
  opts: [
    {
      name: "amount",
      type: "number",
      description:
        "Amount to send in wei (default 0.1 ETH, enough for many transactions)",
    },
  ],
  async run(module, { recipient }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const custom = module.getConfigBinding("faucetKey");
    const key = (custom ? String(custom) : EEZ_CHAINS[chainId]?.faucetKey) as
      | Hex
      | undefined;
    if (!key) {
      throw new ErrorException(
        `${chainLabel(chainId)} has no faucet — set $eez:faucetKey to a funded key to use one`,
      );
    }
    const to = recipient ?? (await module.getConnectedAccount());
    const amount =
      opts.amount !== undefined ? BigInt(opts.amount) : DEFAULT_AMOUNT;

    if (interpreters.simulation) {
      module.context.log(
        `Would send ${formatEther(amount)} ETH to ${to} from the ${chainLabel(chainId)} faucet`,
      );
      return [];
    }

    const client = await module.getClient();
    const faucet = createWalletClient({
      account: privateKeyToAccount(key),
      chain: client.chain,
      transport: module.getTransport(chainId),
    });
    const hash = await faucet.sendTransaction({
      to,
      value: amount,
      chain: client.chain ?? null,
    });
    module.context.log(
      `Sending ${formatEther(amount)} ETH to ${to} from the ${chainLabel(chainId)} faucet: ${hash}`,
    );
    await client.waitForTransactionReceipt({ hash, timeout: 90_000 });
    const balance = await client.getBalance({ address: to });
    module.context.log(
      `:success:${to} now holds ${formatEther(balance)} ETH on ${chainLabel(chainId)}`,
    );
    return [];
  },
});
