import type { Action, BatchedAction, TransactionAction } from "@evmcrispr/core";
import { isBatchedAction, isTransactionAction } from "@evmcrispr/core";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { type DecodedAction, decodeAction } from "./decodeAction";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function DecodedTransaction({ decoded }: { decoded: DecodedAction }) {
  return (
    <div className="border border-evm-green-300/30 bg-evm-gray-900/60 p-3 text-sm font-clearer">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-evm-green-300 break-all">
          {decoded.isDeployment
            ? "deploy contract"
            : (decoded.signature ?? "raw call")}
        </span>
        {decoded.chainId != null && (
          <span className="text-foreground/40 text-xs">
            chain {decoded.chainId}
          </span>
        )}
      </div>

      {decoded.to && (
        <div className="mt-1 text-foreground/70 text-xs">
          to{" "}
          <span className="text-foreground font-mono" title={decoded.to}>
            {shortAddress(decoded.to)}
          </span>
        </div>
      )}

      {decoded.value > 0n && (
        <div className="text-foreground/70 text-xs">
          value{" "}
          <span className="text-evm-yellow-300">
            {formatEther(decoded.value)} ETH
          </span>
        </div>
      )}

      {decoded.args && decoded.args.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {decoded.args.map((arg, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-foreground/40 shrink-0">{arg.type}</span>
              <span className="text-foreground/90 break-all">{arg.value}</span>
            </li>
          ))}
        </ul>
      )}

      {!decoded.signature && !decoded.isDeployment && decoded.data && (
        <div className="mt-1 text-foreground/50 text-xs break-all font-mono">
          {decoded.data}
        </div>
      )}
    </div>
  );
}

function TransactionItem({ action }: { action: TransactionAction }) {
  const [decoded, setDecoded] = useState<DecodedAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    decodeAction(action).then((d) => {
      if (!cancelled) setDecoded(d);
    });
    return () => {
      cancelled = true;
    };
  }, [action]);

  if (!decoded) {
    return (
      <div className="border border-foreground/10 p-3 text-xs text-foreground/40">
        Decoding…
      </div>
    );
  }
  return <DecodedTransaction decoded={decoded} />;
}

function BatchItem({ action }: { action: BatchedAction }) {
  return (
    <div className="border border-evm-blue-300/40 p-2 space-y-2">
      <div className="text-evm-blue-300 text-xs font-head">
        batch · {action.actions.length}{" "}
        {action.actions.length === 1 ? "transaction" : "transactions"} · chain{" "}
        {action.chainId}
      </div>
      {action.actions.map((tx, i) => (
        <TransactionItem key={i} action={tx} />
      ))}
    </div>
  );
}

export interface ActionsPreviewProps {
  actions: Action[];
  /** Shown above the decoded list. */
  title?: string;
}

/**
 * Decoded, read-only rendering of the transactions a script resolves to.
 * This is the no-wallet counterpart of execution: users see exactly what
 * `exec`/`send`/`deploy` would submit, without any way to submit it.
 */
export function ActionsPreview({
  actions,
  title = "Transactions this script would send",
}: ActionsPreviewProps) {
  const visible = actions.filter(
    (a) => isTransactionAction(a) || isBatchedAction(a),
  );
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-foreground/50 text-xs font-head">{title}</p>
      {visible.map((action, i) =>
        isBatchedAction(action) ? (
          <BatchItem key={i} action={action} />
        ) : (
          <TransactionItem key={i} action={action as TransactionAction} />
        ),
      )}
    </div>
  );
}
