import { type ReactNode, useEffect, useState } from "react";
import {
  type ActionDescription,
  type CallDescription,
  chainLabel,
} from "../../runs/action-summary";

const mono = "break-all font-mono text-[11px] text-foreground/70";
const label = "shrink-0 font-sans text-[11px] text-foreground/45";

/** A value shown whole, with a way to copy it exactly. */
function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <span className={mono}>
      {value}{" "}
      <button
        type="button"
        className="cursor-pointer font-sans text-[11px] text-primary underline-offset-2 hover:underline"
        aria-label={`Copy ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

const Row = ({ name, children }: { name: string; children: ReactNode }) => (
  <p className="flex gap-2">
    <span className={label}>{name}</span>
    <span className="min-w-0">{children}</span>
  </p>
);

/** Something long, closed by default and opened to its exact value. */
const Expand = ({ summary, value }: { summary: string; value: string }) => (
  <details>
    <summary className="cursor-pointer font-sans text-[11px] text-foreground/55">
      {summary}
    </summary>
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all bg-black/40 p-1.5 font-mono text-[11px] text-foreground/70">
      {value}
    </pre>
  </details>
);

function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.map((warning) => (
    <p
      key={warning}
      role="alert"
      className="font-sans text-xs text-evm-yellow-300"
    >
      {warning}
    </p>
  ));
}

/** One transaction: where it goes, with how much, calling what. */
function Call({
  call,
  showChain,
}: {
  call: CallDescription;
  showChain: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Row name={call.delegatecall ? "delegatecall to" : "to"}>
        {call.to ? (
          <Copyable value={call.to} />
        ) : (
          <span className={mono}>contract deployment</span>
        )}
      </Row>
      {showChain && call.chainId !== undefined && (
        <Row name="chain">
          <span className={mono}>{chainLabel(call.chainId)}</span>
        </Row>
      )}
      {call.value && (
        <Row name="value">
          <span className={mono} title={`${call.wei} wei`}>
            {call.value}{" "}
            <span className="text-foreground/45">({call.wei} wei)</span>
          </span>
        </Row>
      )}
      {call.selector && (
        <Row name="function">
          <span className={mono}>{call.selector}</span>
        </Row>
      )}
      {call.data !== "0x" && (
        <Expand
          summary={`Calldata (${(call.data.length - 2) / 2} bytes)`}
          value={call.data}
        />
      )}
      <Warnings warnings={call.warnings} />
    </div>
  );
}

/**
 * Everything an action will ask the wallet for, read from its description:
 * every call with its whole target, value, function and calldata; what a
 * signature signs; the steps of a smart batch; and what could not be
 * said. What is long is closed, never cut.
 */
export function ActionDetails({
  description,
}: {
  description: ActionDescription;
}) {
  const { calls, signing, steps, notes, chainId } = description;
  return (
    <div className="flex flex-col gap-1.5 border border-foreground/12 bg-foreground/2.5 px-2 py-1.5">
      <p className="flex items-baseline justify-between gap-3 font-sans text-sm">
        <span className="font-semibold">{description.title}</span>
        {chainId !== undefined && (
          <span className="shrink-0 text-xs text-foreground/60">
            {chainLabel(chainId)}
          </span>
        )}
      </p>
      {calls.length === 0 && !signing && !steps && (
        <p className={mono}>{description.detail}</p>
      )}
      {calls.length > 1 && (
        <p className="font-sans text-xs text-foreground/60">
          {calls.length} calls, sent together:
        </p>
      )}
      {calls.map((call, index) => (
        <div
          key={index}
          className={
            calls.length > 1 ? "border-l border-foreground/15 pl-2" : undefined
          }
        >
          {calls.length > 1 && (
            <p className="font-sans text-xs text-foreground/60">
              {index + 1}. {call.title}
            </p>
          )}
          <Call call={call} showChain={call.chainId !== chainId} />
        </div>
      ))}

      {signing?.kind === "message" && (
        <>
          {signing.text !== undefined && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word bg-black/40 p-1.5 font-mono text-[11px] text-foreground/80">
              {signing.text}
            </pre>
          )}
          <Expand summary="The bytes to sign" value={signing.hex} />
        </>
      )}
      {signing?.kind === "typed" && (
        <>
          <Row name="type">
            <span className={mono}>{signing.primaryType}</span>
          </Row>
          {signing.domain.map(([name, type, value]) => (
            <Row key={`domain.${name}`} name={`domain ${name} (${type})`}>
              <span className={mono}>{value}</span>
            </Row>
          ))}
          {signing.message.map(([name, type, value]) => (
            <Row key={name} name={`${name} (${type})`}>
              <span className={mono}>{value}</span>
            </Row>
          ))}
          <Row name="hash signed">
            <Copyable value={signing.hash} />
          </Row>
          <Expand summary="The typed data, whole" value={signing.raw} />
        </>
      )}
      {signing?.kind === "raw" && (
        <>
          <Row name="method">
            <span className={mono}>{signing.method}</span>
          </Row>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all bg-black/40 p-1.5 font-mono text-[11px] text-foreground/70">
            {signing.raw}
          </pre>
        </>
      )}

      {steps && (
        <ol className="flex flex-col gap-1">
          <li className={mono}>{description.detail}</li>
          {steps.map((step, index) => (
            <li key={index} className="border-l border-foreground/15 pl-2">
              <p className="font-sans text-xs text-foreground/60">
                {index + 1}. {step.label}
              </p>
              {step.call && <Call call={step.call} showChain={false} />}
              {step.note && <p className={mono}>{step.note}</p>}
            </li>
          ))}
        </ol>
      )}

      {description.warning && calls.length === 0 && !steps && (
        <Warnings warnings={[description.warning]} />
      )}
      {(calls.length > 0 || steps) && (
        <p className="font-sans text-[11px] text-foreground/45">
          Only a few risky calls are recognised here: no warning does not mean a
          call is safe.
        </p>
      )}
      {notes.map((note) => (
        <p key={note} className="font-sans text-xs text-foreground/60">
          {note}
        </p>
      ))}
    </div>
  );
}
