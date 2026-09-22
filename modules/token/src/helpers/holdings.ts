import type { Address } from "@evmcrispr/sdk";
import {
  chainLabel,
  defineHelper,
  ErrorException,
  fetchTokenHoldings,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineHelper<Token>({
  name: "holdings",
  batchable: false,
  experimental: true,
  description:
    "Addresses of the ERC-20 tokens an account holds with a nonzero balance, as indexed by the chain's explorer. Read live amounts with @balance before spending them. Needs a chain with a Blockscout instance: plain RPC cannot list what an address holds.",
  returnType: "array",
  args: [
    { name: "address", type: "address", description: "Account to inspect" },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { address, chain }) {
    const chainId =
      chain !== undefined ? resolveChainId(chain) : await module.getChainId();
    const holdings = await fetchTokenHoldings(chainId, address as Address);
    if (holdings === null)
      throw new ErrorException(
        `could not list the tokens of ${address} on ${chainLabel(chainId)} — token holdings need a chain with a Blockscout instance`,
      );
    return holdings.map((holding) => holding.token);
  },
});
