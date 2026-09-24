import {
  BindingsSpace,
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  tokenAmountFormatter,
  tokenLabel,
} from "@evmcrispr/sdk";
import { encodeFunctionData, erc20Abi, isAddressEqual, toHex } from "viem";
import type Swaps from "..";
import {
  executeAccount,
  prepareAccount,
  revalidateAccount,
} from "../twap/account";
import {
  DEFAULT_APP_DATA,
  integer,
  orderHash,
  validateSchedule,
} from "../twap/cow";
import { TWAP_ERRORS } from "../twap/errors";
import {
  protectedMinimum,
  protectionBps,
  twapPreflight,
} from "../twap/preflight";
import { rememberReference } from "../twap/reference";
import { resolveTwap } from "../twap/registry";
import type { TwapReference, TwapSchedule } from "../twap/types";
import { watchTwap } from "../twap/watch";
import { buildApprovalActions } from "../utils/approval";
import { activeSimMode } from "../utils/sim";
import { COW_VAULT_RELAYER, explorerAddressLink } from "../venues/lib/cowApi";

export default defineCommand<Swaps, typeof TWAP_ERRORS>({
  smartSupport: {
    kind: "static",
    reason:
      "Order scheduling, hashing and signed/offline order artifacts require concrete amounts and bounds.",
  },
  name: "twap",
  description:
    "Sell tokens in equal timed parts through CoW from a reusable Safe controlled by @sender. Requires --parts, --every and exactly one of --min or --price-protection. Live preflight is required unless --offline is explicit.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the order hash to",
    },
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Total sell amount in base units, or the keyword `max` for the funder's whole balance; rounded down to a multiple of --parts, the remainder stays with the funder",
    },
    { name: "tokenIn", type: "address", description: "ERC-20 token to sell" },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "tokenOut", type: "address", description: "ERC-20 token to buy" },
  ],
  opts: [
    {
      name: "parts",
      type: "number",
      description: "Required number of equal parts (at least 2)",
    },
    {
      name: "every",
      type: "number",
      description: "Required seconds between parts (1 to 31536000)",
    },
    {
      name: "min",
      type: "number",
      description:
        "Total minimum output if all parts fill; rounded up per part (exclusive with --price-protection)",
    },
    {
      name: "price-protection",
      type: "number",
      description:
        "Maximum decrease from a fresh per-part quote, in percent (0 to 99.99, exact basis points); freezes a fixed price limit",
    },
    {
      name: "offline",
      type: "bool",
      description:
        "Skip external quote, valuation and service checks; requires --min and is mandatory inside sim:fork",
    },
    {
      name: "using",
      type: "twap-venue",
      description: "TWAP provider (default: CoWSwap)",
    },
    {
      name: "start",
      type: "number",
      description:
        "Unix start timestamp; omitted or 0 starts when the registration transaction is mined",
    },
    {
      name: "window",
      type: "number",
      description:
        "Validity of each part in seconds; omitted or 0 uses the full interval",
    },
    {
      name: "to",
      type: "address",
      description: "Recipient of bought tokens (default: @sender)",
    },
    {
      name: "salt",
      type: "bytes32",
      description: "Order salt (default: fresh random bytes32)",
    },
  ],
  errors: TWAP_ERRORS,
  completions: {
    amount: () => [fieldItem("max")],
    to: () => [fieldItem("to")],
  },
  async run(
    module,
    { variable, amount, tokenIn, to, tokenOut },
    { opts, fail, interpreters },
  ) {
    if (to !== "to")
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    // Both tokens are parsed here, so this order is refused before any
    // provider, quote or balance work a loop would otherwise pay for.
    if (isAddressEqual(tokenIn, tokenOut))
      fail(
        "SameToken",
        `${await tokenLabel(module, tokenIn)} cannot be sold for itself`,
      );
    for (const name of ["parts", "every"]) {
      if (opts[name] === undefined)
        throw new ErrorException(`--${name} is required for TWAP orders`);
    }
    if ((opts.min === undefined) === (opts["price-protection"] === undefined))
      throw new ErrorException(
        "Exactly one of --min or --price-protection is required",
      );
    const offline = opts.offline !== undefined && coerceBoolean(opts.offline);
    if (offline && opts.min === undefined)
      throw new ErrorException("--offline requires --min");
    if (activeSimMode(module) && !offline)
      throw new ErrorException(
        "TWAP creation inside sim:fork requires explicit --offline with --min",
      );
    const protection =
      opts["price-protection"] === undefined
        ? undefined
        : protectionBps(opts["price-protection"]);
    const provider = await resolveTwap(module, opts.using, true);
    const controller = await module.getSender();
    const client = await module.getClient();
    // `max` sells whatever the funder holds when the script builds. Inside
    // a Safe block that is the balance before the block executes, so two
    // `max` orders for one token would double count and revert on-chain.
    const requested =
      amount === "max"
        ? await client.readContract({
            address: tokenIn,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [controller],
          })
        : integer(amount, "<amount>");
    const parts = integer(opts.parts, "--parts");
    const min = opts.min === undefined ? undefined : integer(opts.min, "--min");
    if (parts < 2n) throw new ErrorException("--parts must be at least 2");
    if (amount === "max" && requested === 0n)
      fail(
        "NoBalance",
        `${await tokenLabel(module, tokenIn)}: ${controller} holds no balance to sell`,
      );
    if (requested === 0n || min === 0n)
      throw new ErrorException("<amount> and --min must be greater than zero");
    if (requested < parts)
      fail(
        "Unfunded",
        { parts },
        "<amount> must be at least --parts base units so every part sells something",
      );
    // Every TWAP part sells the same amount, so the total must split into
    // equal integer parts. Round down instead of rejecting: a wallet balance
    // almost never divides evenly, and the remainder never leaves the funder.
    const dust = requested % parts;
    const total = requested - dust;
    if (dust > 0n) {
      const fmt = await tokenAmountFormatter(module, tokenIn);
      const symbol = await tokenLabel(module, tokenIn);
      module.context.log(
        `TWAP sells ${fmt(total)}: ${dust} base unit${dust === 1n ? "" : "s"} of ${symbol} (${fmt(dust)}) stays with the funder because ${parts} equal parts cannot include it.`,
      );
    }
    const block = await client.getBlock();
    const schedule: TwapSchedule = {
      sellToken: tokenIn,
      buyToken: tokenOut,
      receiver: opts.to ?? controller,
      partSellAmount: total / parts,
      minPartLimit: min === undefined ? 1n : (min + parts - 1n) / parts,
      t0: integer(opts.start ?? "0", "--start"),
      n: parts,
      t: integer(opts.every, "--every"),
      span: integer(opts.window ?? "0", "--window"),
      appData: DEFAULT_APP_DATA,
    };
    validateSchedule(schedule, block.timestamp);
    await provider.requireDeployment(module);
    const salt = opts.salt ?? toHex(crypto.getRandomValues(new Uint8Array(32)));
    const account = await prepareAccount(
      module,
      controller,
      min === undefined
        ? undefined
        : orderHash(provider.buildParams(schedule, salt)),
    );
    const chainId = await module.getChainId();
    const preflight = offline
      ? undefined
      : await twapPreflight(
          chainId,
          schedule,
          account.account,
          block.timestamp,
          fail,
        );
    if (preflight && protection !== undefined)
      schedule.minPartLimit = protectedMinimum(preflight.netBuy, protection);
    const params = provider.buildParams(schedule, salt);
    const hash = orderHash(params);
    const ref: TwapReference = {
      version: 1,
      provider: "CoWSwap",
      chainId,
      controller,
      account: account.account,
      slot: account.slot,
      params,
      orderHash: hash,
    };
    const funding = await buildApprovalActions(
      module,
      tokenIn,
      controller,
      account.account,
      total,
    );
    const latest = await revalidateAccount(module, controller, account, hash);
    validateSchedule(schedule, latest.timestamp);
    if (preflight && preflight.expiration <= Date.now())
      throw new ErrorException(
        "CoW TWAP quote expired during account validation; retry",
      );
    if (preflight) {
      if (schedule.minPartLimit > preflight.netBuy)
        module.context.log(
          "TWAP limit is currently unfillable at the quoted price; parts require a better price to execute.",
        );
    } else
      module.context.log(
        "TWAP offline mode: external quote, valuation and service checks were explicitly skipped.",
      );
    const calls = [
      ...account.configure,
      {
        to: tokenIn,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transferFrom",
          args: [controller, account.account, total],
        }),
      },
      {
        to: tokenIn,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [COW_VAULT_RELAYER, total],
        }),
      },
      provider.create(params),
    ];
    rememberReference(module, ref);
    module.bindingsManager.setBinding(
      variable,
      hash,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    const actions = [
      ...account.deploy,
      ...funding,
      executeAccount(
        chainId,
        account.account,
        controller,
        account.nonce,
        calls,
      ),
    ];
    // Follows the order until its schedule ends. `client` is the order's
    // chain, even if the script switches chains afterwards.
    const box = interpreters.box?.({
      title: `CoW TWAP ${hash.slice(0, 10)}…`,
      detail: "Waiting for execution",
      follows: actions,
      links: { Orders: explorerAddressLink(chainId, account.account) },
    });
    box?.watch((watch) => watchTwap(box, client, ref, watch));
    return actions;
  },
});
