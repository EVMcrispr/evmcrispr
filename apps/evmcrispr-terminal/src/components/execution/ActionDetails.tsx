import { Button, Notice } from "@repo/ui";
import { type ReactNode, useEffect, useState } from "react";
import {
  type ActionDescription,
  type CallDescription,
  chainLabel,
} from "../../runs/action-summary";

const mono = "break-all font-mono text-caption text-fg-muted";
const label = "shrink-0 font-sans text-caption text-fg-faint";
const block =
  "m-0 max-h-48 overflow-auto whitespace-pre-wrap rounded-(--radius) border-2 border-line bg-surface-well p-2 font-mono text-caption text-fg-muted";
const said = "m-0 font-sans text-caption text-fg-muted";

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
      <Button
        type="button"
        variant="link"
        size="row"
        className="inline-flex"
        aria-label={`Copy ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? "copied" : "copy"}
      </Button>
    </span>
  );
}

const Row = ({ name, children }: { name: string; children: ReactNode }) => (
  <p className="m-0 flex gap-2">
    <span className={label}>{name}</span>
    <span className="min-w-0">{children}</span>
  </p>
);

/** Something long, closed by default and opened to its exact value. */
const Expand = ({ summary, value }: { summary: string; value: string }) => (
  <details>
    <summary className="cursor-pointer font-sans text-caption text-fg-muted">
      {summary}
    </summary>
    <pre className={`${block} break-all`}>{value}</pre>
  </details>
);

function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.map((warning) => (
    <Notice key={warning} tone="warning" layout="inline" urgent>
      {warning}
    </Notice>
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
            {call.value} <span className="text-fg-faint">({call.wei} wei)</span>
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
    <div className="flex flex-col gap-1.5 rounded-(--radius) border-2 border-line bg-surface-1 px-2.5 py-2">
      <p className="m-0 flex items-baseline justify-between gap-3 font-sans text-body">
        <span className="font-semibold text-fg">{description.title}</span>
        {chainId !== undefined && (
          <span className="shrink-0 text-caption text-fg-muted">
            {chainLabel(chainId)}
          </span>
        )}
      </p>
      {calls.length === 0 && !signing && !steps && (
        <p className={`m-0 ${mono}`}>{description.detail}</p>
      )}
      {calls.length > 1 && (
        <p className={said}>{calls.length} calls, sent together:</p>
      )}
      {calls.map((call, index) => (
        <div
          key={index}
          className={
            calls.length > 1 ? "border-l-2 border-line pl-2" : undefined
          }
        >
          {calls.length > 1 && (
            <p className={said}>
              {index + 1}. {call.title}
            </p>
          )}
          <Call call={call} showChain={call.chainId !== chainId} />
        </div>
      ))}

      {signing?.kind === "message" && (
        <>
          {signing.text !== undefined && (
            <pre className={`${block} wrap-break-word`}>{signing.text}</pre>
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
          <pre className={`${block} break-all`}>{signing.raw}</pre>
        </>
      )}

      {steps && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          <li className={mono}>{description.detail}</li>
          {steps.map((step, index) => (
            <li key={index} className="border-l-2 border-line pl-2">
              <p className={said}>
                {index + 1}. {step.label}
              </p>
              {step.call && <Call call={step.call} showChain={false} />}
              {step.note && <p className={`m-0 ${mono}`}>{step.note}</p>}
            </li>
          ))}
        </ol>
      )}

      {description.warning && calls.length === 0 && !steps && (
        <Warnings warnings={[description.warning]} />
      )}
      {(calls.length > 0 || steps) && (
        <p className="m-0 font-sans text-caption text-fg-faint">
          Only a few risky calls are recognised here: no warning does not mean a
          call is safe.
        </p>
      )}
      {notes.map((note) => (
        <p key={note} className={said}>
          {note}
        </p>
      ))}
    </div>
  );
}
