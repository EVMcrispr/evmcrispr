import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import type { Address } from "viem";
import {
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { unpackAccountCalls } from "../src/twap/account";
import { COMPOSABLE_COW, cowAbi } from "../src/twap/cow";
import type { ConditionalOrderParams } from "../src/twap/types";

/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for swap tests.
 */

/** GNO token. Paired with WXDAI on both Honeyswap and SushiSwap at the
 *  pinned fork block, with healthy reserves. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** WXDAI: the wrapped native token on Gnosis. */
export const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const HONEYSWAP_ROUTER = "0x1C232F01118CB8B424793ae03F870aa7D0ac7f77";
export const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

/** Arbitrary addresses (no token contracts) used as recipients or to force
 *  liquidity-path failures. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
export const OTHER_ADDRESS = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

const execAbi = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
]);

/** An unmined TWAP's execution Safe and params, read from the actions
 *  swaps:twap returned: its order hash cannot be resolved before mining. */
export function plannedTwap(
  actions: Action[],
  chainId = 100,
): { account: Address; params: ConditionalOrderParams } {
  for (const action of actions.filter(isTransactionAction)) {
    const { to, data } = action;
    if (!to || !data?.startsWith(toFunctionSelector(execAbi[0]))) continue;
    const { args } = decodeFunctionData({ abi: execAbi, data });
    for (const call of unpackAccountCalls(args[0], args[2], args[3], chainId)) {
      if (!call.to || !call.data || !isAddressEqual(call.to, COMPOSABLE_COW))
        continue;
      const created = decodeFunctionData({ abi: cowAbi, data: call.data });
      return {
        account: getAddress(to),
        params: created.args[0] as ConditionalOrderParams,
      };
    }
  }
  throw new Error("No TWAP registration among the actions");
}
