import type { Address } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";

export { normalizeEnsName, resolveName } from "@evmcrispr/sdk";

export function getAragonEnsResolver(chainId: number): Address | never {
  switch (chainId) {
    case 1:
      return "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
    case 10:
      return "0x6f2CA655f58d5fb94A08460aC19A552EB19909FD";
    case 100:
      return "0xaafca6b0c89521752e559650206d7c925fd0e530";
    default:
      throw new ErrorException(
        `No Aragon ENS resolver found for chain id ${chainId}`,
      );
  }
}
