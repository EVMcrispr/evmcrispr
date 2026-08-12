import { ErrorException, encodeAction, Num } from "@evmcrispr/sdk";
import {
  callReadOperand,
  directReadOperand,
  encodeCond,
  encodePick,
  encodeRead,
  materializeWord,
  OP_SELECTORS,
  operandNode,
  opReadParam,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { AbiFunction, Address } from "viem";
import {
  encodeFunctionData,
  getAbiItem,
  maxUint256,
  toFunctionSelector,
} from "viem";
import { sameAddress } from "../../utils/amounts";
import { compileCompoundedApy } from "../../utils/compileRates";
import { RAY, rayAprToApy } from "../../utils/rates";
import type { LendingAdapter } from "../types";
import { erc20Abi, oracleAbi, poolAbi } from "./abis";
import type { AaveStyleMarket } from "./market";
import { getMarket, readReserve, readVariableDebt } from "./market";

// Stable-rate borrowing was removed in Aave v3.2; every market built from
// this factory runs 3.x (or a fork of it), so all borrows and repays are
// variable rate.
/** ERC-20 balanceOf, the second hop of the debt read. */
const BALANCE_OF = toFunctionSelector("function balanceOf(address)");

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

    async compileHealthFactor(ctx, module, chainId, account) {
      const { pool } = await getMarket(module, market, chainId);
      // getUserAccountData returns six words; the health factor is the
      // last, wad-scaled, so `>= 1.5` compares against 1.5e18.
      const read = await callReadOperand(
        ctx,
        pool,
        getAbiItem({
          abi: poolAbi,
          name: "getUserAccountData",
        }) as AbiFunction,
        [operandNode(account)],
        "Uint",
        5n,
      );
      return { ...read, scale: 18 };
    },

    async compileDebt(ctx, module, chainId, account, token) {
      const { pool } = await getMarket(module, market, chainId);
      await readReserve(module, market, chainId, token);
      // Two hops with a computed target: the variable debt token is word
      // 10 of the reserve struct, and the balance is read off whatever
      // address that word holds at assertion time — so a market that
      // migrates its debt token between build and execution is followed,
      // not cached.
      const reserve = staticCallParam(
        pool,
        encodeFunctionData({
          abi: poolAbi,
          functionName: "getReserveData",
          args: [token],
        }),
      );
      const debtToken = staticCallParam(ctx.core, encodePick(reserve, 10n));
      return {
        kind: "call",
        param: staticCallParam(
          ctx.core,
          encodeRead(debtToken, BALANCE_OF, [materializeWord(ctx, account)]),
        ),
        cat: "Uint",
      };
    },

    async apy(module, chainId, token, side) {
      const reserve = await readReserve(module, market, chainId, token);
      const rate =
        side === "supply"
          ? reserve.currentLiquidityRate
          : reserve.currentVariableBorrowRate;
      return rayAprToApy(rate);
    },

    async compileApy(ctx, module, chainId, token, side) {
      const { pool } = await getMarket(module, market, chainId);
      // Listing is checked at composition time; the rate itself is read
      // at assertion time, which is the point of the face.
      await readReserve(module, market, chainId, token);
      // ReserveDataLegacy is all value types, so the struct encodes
      // inline and each field is one word: currentLiquidityRate is word
      // 2, currentVariableBorrowRate word 4 (see abis.ts).
      const rate = directReadOperand(
        ctx,
        pool,
        encodeFunctionData({
          abi: poolAbi,
          functionName: "getReserveData",
          args: [token],
        }),
        "Uint",
        side === "supply" ? 2n : 4n,
      );
      return compileCompoundedApy(ctx, rate, RAY, 27, {
        perSecond: false,
      });
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

    async compileMaxBorrow(ctx, module, chainId, account, token) {
      const { pool, oracle } = await getMarket(module, market, chainId);
      await readReserve(module, market, chainId, token);
      // The token is a composition-time constant, so its decimals are
      // pinned at build; the borrow headroom (word 2 of the six-word
      // getUserAccountData return) and the oracle price are live.
      const client = await module.getClient();
      const decimals = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      });
      const available = await callReadOperand(
        ctx,
        pool,
        getAbiItem({
          abi: poolAbi,
          name: "getUserAccountData",
        }) as AbiFunction,
        [operandNode(account)],
        "Uint",
        2n,
      );
      const price = directReadOperand(
        ctx,
        oracle,
        encodeFunctionData({
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [token],
        }),
        "Uint",
      );
      // One 512-bit mulDiv keeps zero headroom at zero with no branch;
      // only the zero-price case needs the guard the plain read has,
      // since an unguarded division by it would revert the judge.
      const amount = opReadParam(ctx, OP_SELECTORS.mulDiv, [
        materializeWord(ctx, available),
        rawParam(toWord(10n ** BigInt(decimals))),
        materializeWord(ctx, price),
      ]);
      const guarded = staticCallParam(
        ctx.core,
        encodeCond(
          wordOpParam(
            ctx,
            "gt",
            false,
            materializeWord(ctx, price),
            rawParam(toWord(0n)),
          ),
          amount,
          rawParam(toWord(0n)),
        ),
      );
      return { kind: "call", param: guarded, cat: "Uint" };
    },

    async debt(module, chainId, account, token) {
      return readVariableDebt(module, market, chainId, account, token);
    },
  };
}
