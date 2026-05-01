import "../../setup";
import type { WalletAction } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils";

const walletAction = (chainId: string): WalletAction => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId }],
});

describeCommand("switch", {
  describeName: "Std > commands > switch <networkNameOrId>",
  cases: [
    {
      name: "should return a wallet_switchEthereumChain action for a numeric chain ID",
      script: "switch 100",
      expectedActions: [walletAction("0x64")],
    },
    {
      name: "should resolve a chain name to its chain ID",
      script: "switch gnosis",
      expectedActions: [walletAction("0x64")],
    },
    {
      name: "should resolve mainnet chain name",
      script: "switch mainnet",
      expectedActions: [walletAction("0x1")],
    },
    {
      name: "should work with numeric chain ID as string",
      script: "switch 1",
      expectedActions: [walletAction("0x1")],
    },
  ],
  docCases: [
    {
      description: "Switch by chain name",
      code: `switch gnosis`,
    },
    {
      description: "Switch by chain ID",
      code: `switch 137`,
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an unknown chain name",
      script: "switch fakechainname",
      error: "must be a chain id or a known chain name",
    },
  ],
});
