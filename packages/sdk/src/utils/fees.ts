import { formatGwei, formatUnits } from "viem";
import { ErrorException } from "../errors";
import { viemChainById } from "./chains";

/** The fees a transaction says it pays (EIP-1559), either of them optional. */
export interface FeeFields {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/** What a transaction that gives fees pays per gas, against a base fee. */
export interface ChargedFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** `min(maxFeePerGas, baseFee + maxPriorityFeePerGas)`. */
  gasPrice: bigint;
}

/**
 * The price a transaction pays per gas at `baseFee`, as EIP-1559 sets it, or
 * undefined when it gives no fee: a fork runs such a transaction free. A
 * missing priority fee is 0; a missing max fee is the base fee plus the
 * priority fee. A max fee below the base fee, or a priority fee above the
 * max fee, is refused as a node refuses it.
 */
export function chargedFees(
  fees: FeeFields,
  baseFee: bigint,
): ChargedFees | undefined {
  const { maxFeePerGas: max, maxPriorityFeePerGas: tip } = fees;
  if (max === undefined && tip === undefined) return undefined;
  const maxPriorityFeePerGas = tip ?? 0n;
  const maxFeePerGas = max ?? baseFee + maxPriorityFeePerGas;
  if (maxPriorityFeePerGas > maxFeePerGas)
    throw new ErrorException(
      `The max priority fee per gas (${formatGwei(maxPriorityFeePerGas)} gwei) is higher than the max fee per gas (${formatGwei(maxFeePerGas)} gwei)`,
    );
  if (maxFeePerGas < baseFee)
    throw new ErrorException(
      `The max fee per gas (${formatGwei(maxFeePerGas)} gwei) is below the base fee (${formatGwei(baseFee)} gwei)`,
    );
  const capped = baseFee + maxPriorityFeePerGas;
  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasPrice: capped < maxFeePerGas ? capped : maxFeePerGas,
  };
}

/** The refusal of a transaction whose payer cannot pay its fee: `fee` is
 *  what `cost` says (its gas used, or the most its gas limits can cost). */
export function unpaidFeeError(
  chainId: number,
  payer: string,
  fee: bigint,
  balance: bigint,
  cost = "the gas used costs",
): ErrorException {
  const { symbol, decimals } = viemChainById(chainId)?.nativeCurrency ?? {
    symbol: "ETH",
    decimals: 18,
  };
  const amount = (v: bigint) => `${formatUnits(v, decimals)} ${symbol}`;
  return new ErrorException(
    `${payer} cannot pay the fee: ${cost} ${amount(fee)}, and it has ${amount(balance)}`,
  );
}
