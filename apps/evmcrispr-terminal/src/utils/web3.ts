import type { Address } from "@evmcrispr/core";

export const shortenAddress = (address: Address): string =>
  `${address.slice(0, 6)}..${address.slice(-4)}`;
