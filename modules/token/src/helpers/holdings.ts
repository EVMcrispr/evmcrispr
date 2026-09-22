import type { Address } from "@evmcrispr/sdk";
import {
  chainLabel,
  defineHelper,
  fetchTokenHoldings,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Token from "..";
import { HOLDINGS_ERRORS } from "../holdings/errors";

export default defineHelper<Token, typeof HOLDINGS_ERRORS>({
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
  errors: HOLDINGS_ERRORS,
  async run(module, { address, chain }, { fail }) {
    const chainId =
      chain !== undefined ? resolveChainId(chain) : await module.getChainId();
    // `null` is the only "this chain has no explorer" answer: a failing
    // request throws, and is no business of a NoExplorer capture.
    const holdings = await fetchTokenHoldings(chainId, address as Address);
    // `fail` never returns; `return` says so to the type checker too.
    if (holdings === null)
      return fail(
        "NoExplorer",
        { chainId },
        `could not list the tokens of ${address} on ${chainLabel(chainId)} — token holdings need a chain with a Blockscout instance`,
      );
    return holdings.map((holding) => holding.token);
  },
});
