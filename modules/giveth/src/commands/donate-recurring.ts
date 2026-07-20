import type { TransactionAction } from "@evmcrispr/sdk";
import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import type Giveth from "..";
import { GIVETH_TIP_SLUG } from "../addresses";
import { parseAmount, tipAmount } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { givethLogin } from "../utils/auth";
import type { RecurringDonationRecord } from "../utils/graphql";
import {
  createRecurringDonation,
  fetchProject,
  getAnchor,
  updateRecurringDonation,
  verifyRecurringDonation,
} from "../utils/graphql";
import {
  CFA_FORWARDER,
  cfaForwarderAbi,
  donationCurrency,
  getFlowrate,
  INT96_MAX,
  parseFlowRateOrZero,
  resolveDonationSuperToken,
  superTokenAbi,
  toSuperTokenAmount,
} from "../utils/superfluid";
import { executeTx } from "../utils/tx";

const MODES = ["more", "less", "total"] as const;
type Mode = (typeof MODES)[number];

function setFlowrateAction(
  superToken: Address,
  receiver: Address,
  rate: bigint,
): TransactionAction {
  return encodeAction(CFA_FORWARDER, "setFlowrate(address,address,int96)", [
    superToken,
    receiver,
    Num.fromBigInt(rate),
  ]);
}

export default defineCommand<Giveth>({
  name: "donate-recurring",
  description:
    "Start, adjust, or stop a recurring Giveth donation: a Superfluid stream of the token to the anchor contract of the project (Optimism and Base only), recorded in the Giveth database. `total` sets the absolute rate (0 stops the donation), `more`/`less` adjust an existing one by a delta. The token is the underlying (use @token(SYM); the zero address streams the native SuperToken) or a SuperToken address; --wrap converts underlying into the SuperToken first. Signs you in to Giveth (SIWE) and sends the transactions immediately, so it cannot be batched.",
  batchable: false,
  args: [
    {
      name: "rate",
      type: "number",
      description:
        "Flow rate in wei per second — use a rate literal like 100e18/mo",
    },
    {
      name: "token",
      type: "address",
      description:
        "Token to stream: underlying token, its SuperToken, or the zero address for the native token",
    },
    {
      name: "mode",
      type: "command",
      description:
        "Keyword `total` (set the absolute rate; 0 stops), `more` or `less` (adjust the existing stream by <rate>)",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "project",
      type: "giveth-project",
      description: "Giveth project URL slug",
    },
  ],
  opts: [
    {
      name: "wrap",
      type: "number",
      description:
        "Amount of underlying token (base units) to wrap into the SuperToken before streaming",
    },
    {
      name: "tip",
      type: "number",
      description:
        "Extra stream to Giveth itself as a percentage of <rate> (0-100), added on top (only with `total`)",
    },
    {
      name: "anonymous",
      type: "bool",
      description: "Hide your identity on the recorded donation",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: {
    mode: () => MODES.map((m) => fieldItem(m)),
    to: () => [fieldItem("to")],
  },
  async run(
    module,
    { rate, token, mode, to, project },
    { opts, interpreters },
  ) {
    if (!MODES.includes(mode as Mode)) {
      throw new ErrorException(
        `expected keyword \`total\`, \`more\` or \`less\`, got "${mode}"`,
      );
    }
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const delta = parseFlowRateOrZero(rate);
    if (mode !== "total" && delta === 0n) {
      throw new ErrorException(`\`${mode} 0\` does not change the stream`);
    }
    if (opts.tip !== undefined && mode !== "total") {
      throw new ErrorException("--tip is only valid with `total`");
    }

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "donate-recurring requires an execution context with wallet access",
      );
    }

    const chainId = await module.getChainId();
    const account = await module.getConnectedAccount(true);
    const boosted = await fetchProject(module, project as string);
    const anchor = getAnchor(boosted, chainId);
    const resolved = await resolveDonationSuperToken(module, token as Address);
    const { superToken } = resolved;

    const prev = await getFlowrate(module, superToken, account, anchor);
    let target: bigint;
    if (mode === "total") {
      target = delta;
    } else if (prev === 0n) {
      throw new ErrorException(
        `there is no recurring donation to ${project} to adjust — use \`total\` to start one`,
      );
    } else {
      target = mode === "more" ? prev + delta : prev - delta;
    }
    if (target < 0n) {
      throw new ErrorException(
        `the decrease exceeds the current flow rate (${prev} wei/second); use \`total 0\` to stop`,
      );
    }
    if (target > INT96_MAX) {
      throw new ErrorException(
        "the resulting flow rate exceeds the maximum (int96)",
      );
    }
    const stopping = target === 0n;
    if (stopping && prev === 0n) {
      throw new ErrorException(
        `there is no recurring donation to ${project} to stop`,
      );
    }
    if (stopping && (opts.tip !== undefined || opts.wrap !== undefined)) {
      throw new ErrorException(
        "--tip and --wrap are not valid when stopping a recurring donation",
      );
    }

    const tipRate = opts.tip === undefined ? 0n : tipAmount(target, opts.tip);
    const anonymous =
      opts.anonymous !== undefined && coerceBoolean(opts.anonymous);

    // Resolve the tip stream before moving funds so a missing tip anchor
    // aborts the whole donation.
    let tipAnchor: Address | undefined;
    let tipProjectId: number | undefined;
    let prevTip = 0n;
    if (tipRate > 0n) {
      const tipProject = await fetchProject(module, GIVETH_TIP_SLUG);
      tipAnchor = getAnchor(tipProject, chainId);
      tipProjectId = tipProject.id;
      prevTip = await getFlowrate(module, superToken, account, tipAnchor);
    }

    // Wrap actions, prepared before the buffer check so wrapped funds count.
    const wrapActions: TransactionAction[] = [];
    let wrappedSuperAmount = 0n;
    if (opts.wrap !== undefined) {
      const wrapAmount = parseAmount(opts.wrap);
      if (resolved.native) {
        wrapActions.push(
          encodeAction(superToken, "upgradeByETH()", [], {
            value: wrapAmount,
          }),
        );
        wrappedSuperAmount = wrapAmount;
      } else {
        if (resolved.underlying === superToken) {
          throw new ErrorException(
            `${superToken} has no underlying token to wrap`,
          );
        }
        const skipApprove =
          opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
        if (!skipApprove) {
          const approvals = await buildApprovalActions(
            module,
            resolved.underlying,
            account,
            superToken,
            wrapAmount,
          );
          wrapActions.push(...(approvals as TransactionAction[]));
        }
        // upgrade() takes the 18-decimal SuperToken amount but pulls the
        // equivalent underlying amount.
        wrappedSuperAmount = await toSuperTokenAmount(
          module,
          resolved.underlying,
          wrapAmount,
        );
        wrapActions.push(
          encodeAction(superToken, "upgrade(uint256)", [
            Num.fromBigInt(wrappedSuperAmount),
          ]),
        );
      }
    }

    // The CFA reverts when the available balance can't cover the extra
    // deposit buffer a higher rate requires (the deposit already held for
    // the current rate is credited) — pre-check to fail with a useful hint.
    if (target > prev) {
      const client = await module.getClient();
      const bufferFor = (rate: bigint) =>
        rate === 0n
          ? Promise.resolve(0n)
          : (client.readContract({
              address: CFA_FORWARDER,
              abi: cfaForwarderAbi as Abi,
              functionName: "getBufferAmountByFlowrate",
              args: [superToken, rate],
            }) as Promise<bigint>);
      const [balance, bufferNew, bufferHeld] = await Promise.all([
        client.readContract({
          address: superToken,
          abi: superTokenAbi as Abi,
          functionName: "balanceOf",
          args: [account],
        }) as Promise<bigint>,
        bufferFor(target + tipRate),
        bufferFor(prev + prevTip),
      ]);
      const needed = bufferNew - bufferHeld;
      if (balance + wrappedSuperAmount < needed) {
        throw new ErrorException(
          `the SuperToken balance (${balance + wrappedSuperAmount}) can't cover the stream's deposit buffer (${needed}) — wrap more with --wrap`,
        );
      }
    }

    // Inside a simulation the transactions only exist on the fork — skip the
    // sign-in and never report them to Giveth's database.
    const simulation = interpreters.simulation === true;

    // Sign in before moving funds so a failed login aborts the donation.
    const jwt = simulation
      ? undefined
      : await givethLogin(module, actionCallback);

    for (const action of wrapActions) {
      await executeTx(actionCallback, action, chainId);
    }
    const txHash = await executeTx(
      actionCallback,
      setFlowrateAction(superToken, anchor, target),
      chainId,
    );
    let tipTxHash: string | undefined;
    if (tipRate > 0n && tipAnchor) {
      // The tip stream is additive: increasing a donation's tip tops up the
      // existing stream to Giveth rather than replacing it.
      tipTxHash = await executeTx(
        actionCallback,
        setFlowrateAction(superToken, tipAnchor, prevTip + tipRate),
        chainId,
      );
    }

    if (jwt === undefined) {
      module.context.log(
        "simulation: recurring donation not recorded in Giveth's database",
      );
      return [];
    }

    const currency = await donationCurrency(module, resolved);
    const failures: string[] = [];
    const report = async (
      record: RecurringDonationRecord,
      existing: boolean,
      ended: boolean,
    ) => {
      try {
        const id = ended
          ? await updateRecurringDonation(module, jwt, record, "ended")
          : existing
            ? await updateRecurringDonation(module, jwt, record)
            : await createRecurringDonation(module, jwt, record);
        if (!ended) {
          await verifyRecurringDonation(module, jwt, id);
        }
      } catch (err: any) {
        failures.push(err?.message ?? String(err));
      }
    };

    await report(
      {
        txHash,
        chainId,
        flowRate: target,
        currency,
        projectId: boosted.id,
        anonymous,
      },
      prev > 0n,
      stopping,
    );
    if (tipRate > 0n && tipTxHash && tipProjectId !== undefined) {
      await report(
        {
          txHash: tipTxHash,
          chainId,
          flowRate: prevTip + tipRate,
          currency,
          projectId: tipProjectId,
          anonymous,
        },
        prevTip > 0n,
        false,
      );
    }
    if (failures.length > 0) {
      throw new ErrorException(
        `the stream was updated on-chain (${txHash}) but recording it in Giveth's database failed: ${failures[0]}`,
      );
    }

    return [];
  },
});
