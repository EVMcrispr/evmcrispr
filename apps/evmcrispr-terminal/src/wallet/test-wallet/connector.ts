// A wagmi connector over the terminal's test wallet.
import type { TestWallet } from "@evmcrispr/dev-wallet";
import {
  ChainNotConfiguredError,
  type CreateConnectorFn,
  createConnector,
} from "@wagmi/core";
import { getAddress, numberToHex, SwitchChainError } from "viem";

export const TEST_WALLET_CONNECTOR_ID = "testWallet";

export function testWalletConnector(wallet: TestWallet): CreateConnectorFn {
  let connected = false;
  return createConnector((config) => {
    const onAccountsChanged = (accounts: unknown) =>
      config.emitter.emit("change", {
        accounts: (accounts as string[]).map((a) => getAddress(a)),
      });
    const onChainChanged = (chain: unknown) =>
      config.emitter.emit("change", { chainId: Number(chain) });
    return {
      id: TEST_WALLET_CONNECTOR_ID,
      name: "Test wallet",
      type: "testWallet",
      async connect({ chainId, withCapabilities } = {}) {
        if (chainId && chainId !== wallet.chainId())
          await this.switchChain!({ chainId });
        if (!connected) {
          wallet.provider.on("accountsChanged", onAccountsChanged);
          wallet.provider.on("chainChanged", onChainChanged);
        }
        connected = true;
        const address = wallet.account().address;
        return {
          accounts: (withCapabilities
            ? [{ address, capabilities: {} }]
            : [address]) as never,
          chainId: wallet.chainId(),
        };
      },
      async disconnect() {
        wallet.provider.removeListener("accountsChanged", onAccountsChanged);
        wallet.provider.removeListener("chainChanged", onChainChanged);
        connected = false;
      },
      async getAccounts() {
        return connected ? [wallet.account().address] : [];
      },
      async getChainId() {
        return wallet.chainId();
      },
      async getProvider() {
        return wallet.provider;
      },
      async isAuthorized() {
        return false;
      },
      async switchChain({ chainId }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());
        await wallet.provider
          .request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: numberToHex(chainId) }],
          })
          .catch((error: Error) => {
            throw new SwitchChainError(error);
          });
        return chain;
      },
      onAccountsChanged,
      onChainChanged,
      onDisconnect() {
        connected = false;
        config.emitter.emit("disconnect");
      },
    };
  });
}
