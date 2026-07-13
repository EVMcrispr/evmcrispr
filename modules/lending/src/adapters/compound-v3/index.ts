import { ErrorException, encodeAction, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { COMPOUND_V3 } from "../../addresses";
import { sameAddress } from "../../utils/amounts";
import type { LendingAdapter } from "../types";
import { cometAbi } from "./abis";
import { marketForBase, marketForToken } from "./market";
import { perSecondRateToApy } from "./rates";

/**
 * Compound v3 (Comet). Each market lends a single base asset: borrowing is
 * withdrawing the base below a zero balance, repaying is supplying it back,
 * and every other listed asset is pure collateral (no interest, managed
 * automatically — hence no set-collateral, no e-mode, and no health factor;
 * use @lending:maxBorrow / @lending:debt instead).
 */
const compoundV3: LendingAdapter = {
  name: "CompoundV3",
  kind: "onchain",
  supports: (chainId) => chainId in COMPOUND_V3,

  async buildSupply(module, req) {
    const { deployment } = await marketForToken(module, req.chainId, req.token);
    const amount = req.amount as bigint;
    const action = sameAddress(req.onBehalfOf, req.from)
      ? encodeAction(deployment.comet, "supply(address,uint256)", [
          req.token,
          Num.fromBigInt(amount),
        ])
      : encodeAction(deployment.comet, "supplyTo(address,address,uint256)", [
          req.onBehalfOf,
          req.token,
          Num.fromBigInt(amount),
        ]);
    return {
      approvalTarget: deployment.comet,
      approvalAmount: amount,
      actions: [action],
    };
  },

  async buildWithdraw(module, req) {
    const { deployment } = await marketForToken(module, req.chainId, req.token);
    // maxUint256 withdraws the full supplied balance (base or collateral)
    // without flipping the position into a borrow.
    const amount = req.amount === "max" ? maxUint256 : req.amount;
    const action = sameAddress(req.to, req.from)
      ? encodeAction(deployment.comet, "withdraw(address,uint256)", [
          req.token,
          Num.fromBigInt(amount),
        ])
      : encodeAction(deployment.comet, "withdrawTo(address,address,uint256)", [
          req.to,
          req.token,
          Num.fromBigInt(amount),
        ]);
    return { actions: [action] };
  },

  async buildBorrow(module, req) {
    if (!sameAddress(req.onBehalfOf, req.from)) {
      throw new ErrorException(
        "CompoundV3 does not support borrowing on behalf of another account",
      );
    }
    const { comet } = await marketForBase(module, req.chainId, req.token);
    // Borrowing is withdrawing the base asset beyond the supplied balance.
    return {
      actions: [
        encodeAction(comet, "withdraw(address,uint256)", [
          req.token,
          Num.fromBigInt(req.amount as bigint),
        ]),
      ],
    };
  },

  async buildRepay(module, req) {
    const { comet } = await marketForBase(module, req.chainId, req.token);
    let amount: bigint;
    let approvalAmount: bigint;
    if (req.amount === "max") {
      if (!sameAddress(req.onBehalfOf, req.from)) {
        throw new ErrorException(
          "CompoundV3 does not accept `max` together with --on-behalf-of; pass an explicit amount",
        );
      }
      const client = await module.getClient();
      const debt = await client.readContract({
        address: comet,
        abi: cometAbi,
        functionName: "borrowBalanceOf",
        args: [req.from],
      });
      if (debt === 0n) {
        throw new ErrorException(`no ${req.token} debt to repay on CompoundV3`);
      }
      // supply(base, uint256.max) repays exactly the outstanding borrow;
      // the 0.1% buffer covers interest accrued between build and execution.
      amount = maxUint256;
      approvalAmount = debt + debt / 1000n + 1n;
    } else {
      amount = req.amount;
      approvalAmount = req.amount;
    }
    // Repaying is supplying the base asset while in debt.
    const action = sameAddress(req.onBehalfOf, req.from)
      ? encodeAction(comet, "supply(address,uint256)", [
          req.token,
          Num.fromBigInt(amount),
        ])
      : encodeAction(comet, "supplyTo(address,address,uint256)", [
          req.onBehalfOf,
          req.token,
          Num.fromBigInt(amount),
        ]);
    return { approvalTarget: comet, approvalAmount, actions: [action] };
  },

  // No buildSetCollateral (collateral is automatic), no buildSetEmode, and
  // no healthFactor (Comet only exposes isBorrowCollateralized).

  async apy(module, chainId, token, side) {
    const { comet } = await marketForBase(module, chainId, token);
    const client = await module.getClient();
    const utilization = await client.readContract({
      address: comet,
      abi: cometAbi,
      functionName: "getUtilization",
    });
    const rate = await client.readContract({
      address: comet,
      abi: cometAbi,
      functionName: side === "supply" ? "getSupplyRate" : "getBorrowRate",
      args: [utilization],
    });
    return perSecondRateToApy(rate);
  },

  async maxBorrow(module, chainId, account, token) {
    const { comet } = await marketForBase(module, chainId, token);
    const client = await module.getClient();
    const read = <T>(functionName: any, args?: any): Promise<T> =>
      client.readContract({
        address: comet,
        abi: cometAbi,
        functionName,
        args,
      }) as Promise<T>;

    const [numAssets, baseScale, basePriceFeed, borrowBalance] =
      await Promise.all([
        read<number>("numAssets"),
        read<bigint>("baseScale"),
        read<Address>("baseTokenPriceFeed"),
        read<bigint>("borrowBalanceOf", [account]),
      ]);
    const basePrice = await read<bigint>("getPrice", [basePriceFeed]);
    if (basePrice === 0n) return 0n;

    // Borrowing capacity: sum of collateral balances valued at the oracle
    // price, discounted by each asset's borrow collateral factor (1e18).
    let capacity = 0n; // in the oracle's base currency (8 decimals)
    for (let i = 0; i < numAssets; i++) {
      const info = await read<{
        asset: Address;
        priceFeed: Address;
        scale: bigint;
        borrowCollateralFactor: bigint;
      }>("getAssetInfo", [i]);
      const balance = await read<bigint>("collateralBalanceOf", [
        account,
        info.asset,
      ]);
      if (balance === 0n) continue;
      const price = await read<bigint>("getPrice", [info.priceFeed]);
      capacity +=
        (((balance * price) / info.scale) * info.borrowCollateralFactor) /
        10n ** 18n;
    }

    const capacityBase = (capacity * baseScale) / basePrice;
    return capacityBase > borrowBalance ? capacityBase - borrowBalance : 0n;
  },

  async debt(module, chainId, account, token) {
    const { comet } = await marketForBase(module, chainId, token);
    const client = await module.getClient();
    return client.readContract({
      address: comet,
      abi: cometAbi,
      functionName: "borrowBalanceOf",
      args: [account],
    });
  },
};

export default compoundV3;
