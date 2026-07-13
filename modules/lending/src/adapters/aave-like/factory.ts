import { ErrorException, encodeAction, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { sameAddress } from "../../utils/amounts";
import type { LendingAdapter } from "../types";
import { erc20Abi, oracleAbi, poolAbi } from "./abis";
import type { AaveStyleMarket } from "./market";
import { getMarket, readReserve, readVariableDebt } from "./market";
import { rayAprToApy } from "./rates";

// Stable-rate borrowing was removed in Aave v3.2; every market built from
// this factory runs 3.x (or a fork of it), so all borrows and repays are
// variable rate.
const VARIABLE_RATE = "2";
const REFERRAL_CODE = "0";

/**
 * Build a LendingAdapter for an Aave-v3-style market (Aave itself, Spark,
 * and other forks that keep the Pool ABI): everything is derived from the
 * market's PoolAddressesProvider address book.
 */
export function makeAaveStyleAdapter(
  name: string,
  providers: Record<number, Address>,
): LendingAdapter {
  const market: AaveStyleMarket = { name, providers };

  return {
    name,
    kind: "onchain",
    supports: (chainId) => chainId in providers,

    async buildSupply(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      await readReserve(module, market, req.chainId, req.token);
      const amount = req.amount as bigint;
      return {
        approvalTarget: pool,
        approvalAmount: amount,
        actions: [
          encodeAction(pool, "supply(address,uint256,address,uint16)", [
            req.token,
            Num.fromBigInt(amount),
            req.onBehalfOf,
            REFERRAL_CODE,
          ]),
        ],
      };
    },

    async buildWithdraw(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      await readReserve(module, market, req.chainId, req.token);
      // maxUint256 makes the Pool burn the full aToken balance.
      const amount = req.amount === "max" ? maxUint256 : req.amount;
      return {
        actions: [
          encodeAction(pool, "withdraw(address,uint256,address)", [
            req.token,
            Num.fromBigInt(amount),
            req.to,
          ]),
        ],
      };
    },

    async buildBorrow(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      await readReserve(module, market, req.chainId, req.token);
      return {
        actions: [
          encodeAction(pool, "borrow(address,uint256,uint256,uint16,address)", [
            req.token,
            Num.fromBigInt(req.amount as bigint),
            VARIABLE_RATE,
            REFERRAL_CODE,
            req.onBehalfOf,
          ]),
        ],
      };
    },

    async buildRepay(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      let amount: bigint;
      let approvalAmount: bigint;
      if (req.amount === "max") {
        // Aave rejects uint256.max repays on behalf of another account
        // (validation error 26): the debt owner must be the sender.
        if (!sameAddress(req.onBehalfOf, req.from)) {
          throw new ErrorException(
            `${name} does not accept \`max\` together with --on-behalf-of; pass an explicit amount`,
          );
        }
        const debt = await readVariableDebt(
          module,
          market,
          req.chainId,
          req.onBehalfOf,
          req.token,
        );
        if (debt === 0n) {
          throw new ErrorException(
            `no variable ${req.token} debt to repay on ${name}`,
          );
        }
        // The Pool pulls only the actual debt; the 0.1% buffer covers
        // interest accrued between build and execution and is never spent.
        amount = maxUint256;
        approvalAmount = debt + debt / 1000n + 1n;
      } else {
        await readReserve(module, market, req.chainId, req.token);
        amount = req.amount;
        approvalAmount = req.amount;
      }
      return {
        approvalTarget: pool,
        approvalAmount,
        actions: [
          encodeAction(pool, "repay(address,uint256,uint256,address)", [
            req.token,
            Num.fromBigInt(amount),
            VARIABLE_RATE,
            req.onBehalfOf,
          ]),
        ],
      };
    },

    async buildSetCollateral(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      await readReserve(module, market, req.chainId, req.token);
      return {
        actions: [
          encodeAction(pool, "setUserUseReserveAsCollateral(address,bool)", [
            req.token,
            req.enabled,
          ]),
        ],
      };
    },

    async buildSetEmode(module, req) {
      const { pool } = await getMarket(module, market, req.chainId);
      return {
        actions: [
          encodeAction(pool, "setUserEMode(uint8)", [String(req.categoryId)]),
        ],
      };
    },

    async healthFactor(module, chainId, account) {
      const { pool } = await getMarket(module, market, chainId);
      const client = await module.getClient();
      const [, , , , , healthFactor] = await client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: "getUserAccountData",
        args: [account],
      });
      return healthFactor;
    },

    async apy(module, chainId, token, side) {
      const reserve = await readReserve(module, market, chainId, token);
      const rate =
        side === "supply"
          ? reserve.currentLiquidityRate
          : reserve.currentVariableBorrowRate;
      return rayAprToApy(rate);
    },

    async maxBorrow(module, chainId, account, token) {
      const { pool, oracle } = await getMarket(module, market, chainId);
      await readReserve(module, market, chainId, token);
      const client = await module.getClient();
      const [, , availableBorrowsBase] = await client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: "getUserAccountData",
        args: [account],
      });
      if (availableBorrowsBase === 0n) return 0n;
      // availableBorrowsBase and getAssetPrice share the market's base
      // currency (8 decimals on every listed chain), so the units cancel.
      const [price, decimals] = await Promise.all([
        client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [token],
        }),
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
      if (price === 0n) return 0n;
      return (availableBorrowsBase * 10n ** BigInt(decimals)) / price;
    },

    async debt(module, chainId, account, token) {
      return readVariableDebt(module, market, chainId, account, token);
    },
  };
}
