// The one test wallet of the page (main thread only), when experimental
// features are on.
import { isExperimentalEnabled } from "@evmcrispr/sdk";
import { chains, rpcUrls, transports } from "../../config/rpc";
import { createTerminalTestWallet, testWalletChains } from "./wallet";

export const terminalTestWallet = isExperimentalEnabled()
  ? createTerminalTestWallet(testWalletChains(chains, rpcUrls, transports))
  : undefined;
