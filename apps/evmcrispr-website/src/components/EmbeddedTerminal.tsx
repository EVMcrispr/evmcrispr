import { EvmcrisprTerminal } from "@evmcrispr/editor";
import { http } from "viem";
import "@evmcrispr/editor/style.css";

const DRPC_API_KEY = import.meta.env.VITE_DRPC_API_KEY;

// Read-only RPC for the demo (mainnet). Other chains fall back to the
// core default public endpoints.
const transports = DRPC_API_KEY
  ? { 1: http(`https://lb.drpc.live/ethereum/${DRPC_API_KEY}`) }
  : undefined;

/**
 * React island wrapping the embeddable terminal in no-wallet mode:
 * scripts are interpreted with a read-only public client, `print`
 * output lands in the console, and `exec`-style transactions are
 * decoded and displayed — never sent.
 */
export default function EmbeddedTerminal({
  script,
  height = 260,
}: {
  script: string;
  height?: number;
}) {
  return (
    <EvmcrisprTerminal
      defaultScript={script}
      height={height}
      transports={transports}
    />
  );
}
