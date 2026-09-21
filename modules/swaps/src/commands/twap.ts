import {
  BindingsSpace,
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
} from "@evmcrispr/sdk";
import { encodeFunctionData, erc20Abi, toHex } from "viem";
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
import {
  protectedMinimum,
  protectionBps,
  twapPreflight,
} from "../twap/preflight";
import { resolveTwap } from "../twap/registry";
import type { TwapReference, TwapSchedule } from "../twap/types";
import { buildApprovalActions } from "../utils/approval";
import { activeSimMode } from "../utils/sim";
import { COW_VAULT_RELAYER } from "../venues/lib/cowApi";

export default defineCommand<Swaps>({
  name: "twap",
  description:
    "Sell tokens in equal timed parts through CoW from a reusable Safe controlled by @sender. Requires --parts, --every and exactly one of --min or --price-protection. Live preflight is required unless --offline is explicit.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the order reference to",
    },
    {
      name: "amount",
      type: "number",
      description:
        "Total sell amount in base units, exactly divisible by --parts",
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
  completions: { to: () => [fieldItem("to")] },
  async run(module, { variable, amount, tokenIn, to, tokenOut }, { opts }) {
    if (to !== "to")
      throw new ErrorException(`expected keyword "to", got "${to}"`);
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
    const total = integer(amount, "<amount>");
    const parts = integer(opts.parts, "--parts");
    const min = opts.min === undefined ? undefined : integer(opts.min, "--min");
    if (parts < 2n) throw new ErrorException("--parts must be at least 2");
    if (total === 0n || min === 0n)
      throw new ErrorException("<amount> and --min must be greater than zero");
    if (total % parts !== 0n)
      throw new ErrorException("<amount> must be exactly divisible by --parts");
    const controller = await module.getSender();
    const client = await module.getClient();
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
      module.context.log(
        `CoW TWAP preflight: ${JSON.stringify({
          quotedAt: preflight.quotedAt,
          expiresAt: new Date(preflight.expiration).toISOString(),
          estimatedFeePerPart: preflight.fee.toString(),
          protocolFeeBps: preflight.protocolFeeBps.toString(),
          estimatedProtocolFeeInBuyToken: preflight.protocolFeeInBuy.toString(),
          expectedNetBuyPerPart: preflight.netBuy.toString(),
          minBuyPerPart: schedule.minPartLimit.toString(),
          minimumIfAllPartsFill: (schedule.minPartLimit * parts).toString(),
          notionalUsdcPerPart: preflight.notionalUsdc,
        })}`,
      );
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
    const reference = JSON.stringify(ref);
    module.bindingsManager.setBinding(
      variable,
      reference,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    module.context.log(
      `Prepared CoW TWAP ${hash} in Safe ${account.account}. Registration becomes active only after execution. Save this reference for status, cancellation and recovery:\n${reference}`,
    );
    return [
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
  },
});
