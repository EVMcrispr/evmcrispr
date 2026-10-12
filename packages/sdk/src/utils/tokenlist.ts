import type { Address } from "viem";
import { getAddress, isAddress } from "viem";

/** What a token list says about one token, as far as symbols go. */
export interface TokenListEntry {
  symbol: string;
  chainId: number;
  address: string;
}

/** A symbol that can be written bare in a script and read back as itself. */
export const PLAIN_WORD = /^[A-Za-z][A-Za-z0-9]*$/;

/** The token a symbol stands for in a list: the first entry of the chain
 *  with that symbol. The one rule, for resolving a symbol and for choosing
 *  to write one. */
export function tokenInList(
  tokens: readonly TokenListEntry[],
  chainId: number,
  symbol: string,
): Address | undefined {
  const found = tokens.find(
    (token) => token.symbol === symbol && token.chainId === chainId,
  )?.address;
  return found && isAddress(found) ? getAddress(found) : undefined;
}

/** The symbol that may be written for a token: one the list gives it and
 *  resolves back to exactly it. A symbol shared with an earlier entry, one
 *  that reads as the chain's own currency, and one that is not a plain
 *  word stand for something else, or for nothing: none is returned. */
export function symbolInList(
  tokens: readonly TokenListEntry[],
  chainId: number,
  nativeSymbol: string,
  address: Address,
): string | undefined {
  if (!isAddress(address)) return undefined;
  const wanted = getAddress(address);
  for (const { symbol, chainId: on, address: listed } of tokens) {
    if (on !== chainId || typeof symbol !== "string") continue;
    if (!isAddress(listed) || getAddress(listed) !== wanted) continue;
    if (!PLAIN_WORD.test(symbol) || /^(true|false)$/.test(symbol)) continue;
    if (symbol.toUpperCase() === nativeSymbol.toUpperCase()) continue;
    if (tokenInList(tokens, chainId, symbol) === wanted) return symbol;
  }
  return undefined;
}
