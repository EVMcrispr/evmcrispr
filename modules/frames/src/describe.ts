// What a frame action's review shows, said by the module: every frame as
// written, who pays, and what the wallet will be asked. Host-neutral: plain
// strings and raw calls; the host escapes and decodes them.
import { chainLabel, type ModuleActionDescription } from "@evmcrispr/sdk";
import { frameSidecarOf } from "@evmcrispr/viem-frames";
import { FRAME_ACCOUNT_DOMAIN_NAME } from "./account";
import type { FrameModuleAction } from "./frame-action";
import { frameNetwork, frameNetworkNames } from "./networks";

type Described = Omit<FrameModuleAction, "description">;

/** Who pays, as the frames say: the first verify frame approving payment. */
function payer({ from, data }: Described): string {
  const paying = data.frames.find(
    (frame) =>
      frame.mode === "verify" &&
      (frame.approve === "payment" || frame.approve === "both"),
  );
  if (!paying) return "no frame (none approves payment)";
  const who = data.account ? "the account" : "the sender";
  return paying.target === null ||
    paying.target.toLowerCase() === from.toLowerCase()
    ? `${who} ${from}`
    : `the sponsor ${paying.target}`;
}

function steps({ from, data }: Described): ModuleActionDescription["steps"] {
  // Verify frames lead; they reserve no state gas.
  let prefix = 0;
  data.frames.forEach((frame, index) => {
    if (frame.mode === "verify") prefix = index + 1;
  });
  const limit = (value: bigint | undefined) =>
    value === undefined ? "none" : String(value);
  return data.frames.map((frame, index) => {
    const scope =
      frame.mode === "verify" ? ` approving ${frame.approve ?? "nothing"}` : "";
    const self =
      frame.target === null
        ? data.account
          ? ", to the account itself"
          : ", to the sender itself"
        : "";
    const atomic = frame.atomic ? ", atomic with the next frame" : "";
    const state = index < prefix ? "0" : limit(frame.stateGas);
    return {
      label: `${frame.mode}${scope}${self}${atomic} · gas ${limit(frame.gas)}, state gas ${state}`,
      call: { to: frame.target ?? from, data: frame.data, value: frame.value },
    };
  });
}

/** Why sending will refuse it, said before anything is signed. */
function warning({ chainId, data }: Described): string | undefined {
  const network = frameNetwork(chainId);
  if (!network)
    return `Frame transactions are sent on ${frameNetworkNames()}, not on ${chainLabel(chainId)}: it will be refused.`;
  if (data.mempool === "alt" && !frameSidecarOf(network.chain))
    return `The ${network.chain.name} has no alt mempool: it will be refused (write \`--mempool canonical\`).`;
  return undefined;
}

export function describeFrameAction(
  action: Described,
): ModuleActionDescription {
  const { from, data, chainId } = action;
  const count = `${data.frames.length} frames`;
  if (!data.account)
    return {
      title: `Frame transaction from ${from}`,
      detail: `${count}, paid by ${payer(action)}`,
      meta: count,
      warning: warning(action),
      steps: steps(action),
      notes: [
        `When it is sent, the wallet of the sender ${from} is asked to sign it as a type 0x06 transaction (eth_signTransaction), with the nonce and fees filled in; a wallet that does not sign frame transactions refuses it.`,
      ],
    };
  const owner = data.account.owner;
  const chain = frameNetwork(chainId)?.chain.name ?? chainLabel(chainId);
  return {
    title: `Frame transaction from account ${from}`,
    detail: `${count}, paid by ${payer(action)}`,
    meta: `${count} · typed data signed by ${owner}`,
    warning: warning(action),
    steps: steps(action),
    notes: [
      `When it is sent, the wallet of the owner ${owner} is asked to sign typed data FrameTransaction(bytes32 sigHash).`,
      `Its domain: name "${FRAME_ACCOUNT_DOMAIN_NAME}", version "1", the ${chain}'s chain, verifying contract ${from} (the account).`,
      "sigHash is the transaction's signature hash. The nonce and fees it covers are read from the chain when it is sent, so they and the hash are not shown here: the wallet's prompt shows the hash.",
    ],
  };
}
