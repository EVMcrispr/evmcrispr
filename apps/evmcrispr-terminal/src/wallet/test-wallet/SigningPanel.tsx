import type { DecodedCall, SigningRequest } from "@evmcrispr/dev-wallet";
import { Badge, Button, Facts, Overlay, Row, Well } from "@repo/ui";
import { useEffect, useState } from "react";
import { formatGwei } from "viem";

/** A call as decoded from its bytes, with where the decoding came from. */
function Call({ call }: { call: DecodedCall }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Facts>
          <Facts.Item name="Calls" mono>
            {call.functionName ?? call.selector ?? "call"}
          </Facts.Item>
        </Facts>
        <Badge
          variant="tag"
          tone={call.source === "none" ? "warning" : "neutral"}
        >
          {call.sourceLabel}
        </Badge>
      </div>
      {call.args && call.args.length > 0 && (
        <Facts>
          {call.args.map((arg) => (
            <Facts.Item key={arg.name} name={`${arg.name} (${arg.type})`}>
              {arg.shown}
            </Facts.Item>
          ))}
        </Facts>
      )}
      {call.source === "none" && <Well size="sm">{call.words.join("\n")}</Well>}
    </div>
  );
}

const TITLE: Record<SigningRequest["kind"], string> = {
  transaction: "Send a transaction",
  "typed-data": "Sign typed data",
  message: "Sign a message",
  "frame-transaction": "Sign a frame transaction",
};

/** What the test wallet is asked to sign, as it read it from the bytes. */
export function SigningRequestView({ request }: { request: SigningRequest }) {
  const common = (
    <>
      <Facts.Item name="Chain">{request.chain.name}</Facts.Item>
      <Facts.Item name="From">{request.from}</Facts.Item>
    </>
  );
  switch (request.kind) {
    case "transaction":
      return (
        <div className="flex flex-col gap-3">
          <Facts>
            {common}
            <Facts.Item name="To">
              {request.deployment
                ? "a new contract (deployment)"
                : `${request.to}${request.toLabel ? ` (${request.toLabel})` : ""}`}
            </Facts.Item>
            <Facts.Item name="Value">{request.valueShown}</Facts.Item>
            <Facts.Item name="Nonce">{request.nonce}</Facts.Item>
            <Facts.Item name="Gas">
              {`${request.gas} at most ${formatGwei(request.maxFeePerGas)} gwei (priority ${formatGwei(request.maxPriorityFeePerGas)})`}
            </Facts.Item>
            <Facts.Item name="Costs at most">{request.maxCostShown}</Facts.Item>
          </Facts>
          {request.call && <Call call={request.call} />}
        </div>
      );
    case "typed-data":
      return (
        <Facts>
          {common}
          <Facts.Item name="Domain">
            {[
              request.domain.name,
              request.domain.version && `version ${request.domain.version}`,
              request.domain.chainId !== undefined &&
                `chain ${request.domain.chainId}`,
              request.domain.verifyingContract,
              request.domain.salt && `salt ${request.domain.salt}`,
            ]
              .filter(Boolean)
              .join(", ")}
          </Facts.Item>
          <Facts.Item name="Type">{request.primaryType}</Facts.Item>
          {request.fields.map((field) => (
            <Facts.Item key={field.name} name={`${field.name} (${field.type})`}>
              {field.shown}
            </Facts.Item>
          ))}
        </Facts>
      );
    case "message":
      return (
        <div className="flex flex-col gap-3">
          <Facts>{common}</Facts>
          {request.text === undefined ? (
            <>
              <Badge variant="tag" tone="warning">
                not text: the bytes as hex
              </Badge>
              <Well size="sm">{request.hex}</Well>
            </>
          ) : (
            <Well size="sm">{request.text}</Well>
          )}
        </div>
      );
    case "frame-transaction":
      return (
        <div className="flex flex-col gap-3">
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {request.frames.map((frame, i) => (
              <Row
                key={i}
                as="li"
                wrap
                title={`${i + 1}. ${frame.mode}: ${frame.gloss}`}
                meta={
                  <span className="flex flex-wrap gap-2">
                    {frame.scope && <Badge>{`approves ${frame.scope}`}</Badge>}
                    {frame.atomic && <Badge>atomic with the next frame</Badge>}
                  </span>
                }
              >
                <div className="flex flex-col gap-2 px-2.5 pb-2">
                  <Facts>
                    <Facts.Item name="Target">
                      {frame.target
                        ? `${frame.target}${frame.targetLabel ? ` (${frame.targetLabel})` : ""}`
                        : "the sender"}
                    </Facts.Item>
                    <Facts.Item name="Value">{frame.valueShown}</Facts.Item>
                    <Facts.Item name="Limits">
                      {`gas ${frame.gas}, state gas ${frame.stateGas}`}
                    </Facts.Item>
                  </Facts>
                  {frame.call && <Call call={frame.call} />}
                </div>
              </Row>
            ))}
          </ol>
          <Facts>
            {common}
            <Facts.Item name="Paid by">{request.payer}</Facts.Item>
            <Facts.Item name="Nonce">{String(request.nonce)}</Facts.Item>
            <Facts.Item name="Fees">
              {`at most ${formatGwei(request.maxFeePerGas)} gwei per gas (priority ${formatGwei(request.maxPriorityFeePerGas)})`}
            </Facts.Item>
            <Facts.Item name="Costs at most">{request.maxCostShown}</Facts.Item>
            <Facts.Item name="Signature hash">{request.sigHash}</Facts.Item>
          </Facts>
        </div>
      );
  }
}

const ARM_MS = 600;

/** The test wallet's prompt: what it is asked to sign, Approve or Reject. */
export function SigningPanel({
  request,
  onApprove,
  onReject,
  sheet,
}: {
  request: SigningRequest | undefined;
  onApprove: () => void;
  onReject: () => void;
  sheet?: boolean;
}) {
  // Approve waits a moment after a request is shown, so a click meant for
  // the one before never approves it.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    if (!request) return;
    const timer = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(timer);
  }, [request]);
  return (
    <Overlay
      open={request !== undefined}
      onOpenChange={(open) => !open && onReject()}
      sheet={sheet}
      size="lg"
      focus="popup"
      title={request ? TITLE[request.kind] : "Test wallet"}
      description="Test wallet: anvil's public accounts, on a local chain"
      closeLabel="Reject"
      footer={
        <>
          <Button variant="quiet" onClick={onReject}>
            Reject
          </Button>
          <Button variant="primary" onClick={onApprove} disabled={!armed}>
            Approve
          </Button>
        </>
      }
    >
      {request && <SigningRequestView request={request} />}
    </Overlay>
  );
}
