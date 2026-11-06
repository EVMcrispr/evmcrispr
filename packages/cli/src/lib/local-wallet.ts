import { chainLabel } from "@evmcrispr/sdk";
import {
  type Address,
  createWalletClient,
  custom,
  type Hex,
  hexToBigInt,
  http,
  isAddressEqual,
  isHex,
  type WalletClient,
} from "viem";
import type { ConfirmingAccount } from "./local-signer";

/** Methods that sign or send as an account: never forwarded to the node,
 *  which may hold the same key unlocked (anvil) and would sign unasked. */
const SIGNING =
  /^(eth_sign|eth_send(?!RawTransaction$)|personal_|wallet_|eth_accounts$|eth_requestAccounts$)/;

const hexBig = (value: unknown) =>
  typeof value === "string" ? hexToBigInt(value as Hex) : undefined;

/**
 * The wallet client of the local key. Ordinary reads and the raw
 * transactions it signs go to the node at `rpcUrl`; every request that
 * signs (a message, typed data, a transaction) is signed by `signer`,
 * so it is confirmed first, and any other signing method is refused.
 */
export function localWallet(
  signer: ConfirmingAccount,
  chainId: number,
  rpcUrl: string,
): WalletClient {
  const node = http(rpcUrl)({ chain: undefined });
  const ours = (address: unknown, method: string) => {
    if (
      typeof address !== "string" ||
      !isHex(address) ||
      !isAddressEqual(address as Address, signer.address)
    )
      throw new Error(
        `${method} asks for an account other than the local key's (${signer.address})`,
      );
  };
  const oneChain = () =>
    new Error(
      `The local key signs on one chain per run (${chainLabel(chainId)}): set EVMCRISPR_DEFAULT_CHAIN_ID`,
    );
  const wallet: WalletClient = createWalletClient({
    account: signer,
    transport: custom(
      {
        async request({
          method,
          params = [],
        }: {
          method: string;
          params?: any[];
        }) {
          switch (method) {
            case "eth_accounts":
            case "eth_requestAccounts":
              return [signer.address];
            case "personal_sign": {
              const [message, address] = params;
              ours(address, method);
              return signer.signMessage({
                message: isHex(message) ? { raw: message } : String(message),
              });
            }
            case "eth_sign": {
              const [address, data] = params;
              ours(address, method);
              if (!isHex(data)) throw new Error("eth_sign expects hex data");
              return signer.signMessage({ message: { raw: data } });
            }
            case "eth_signTypedData_v4": {
              const [address, json] = params;
              ours(address, method);
              const typed = typeof json === "string" ? JSON.parse(json) : json;
              return signer.signTypedData({
                domain: typed.domain ?? {},
                types: typed.types,
                primaryType: typed.primaryType,
                message: typed.message,
              });
            }
            case "eth_sendTransaction": {
              const [tx] = params;
              ours(tx?.from, method);
              return wallet.sendTransaction({
                account: signer,
                chain: null,
                to: tx.to ?? undefined,
                data: tx.data ?? tx.input,
                value: hexBig(tx.value),
                gas: hexBig(tx.gas),
                nonce:
                  tx.nonce !== undefined ? Number(hexBig(tx.nonce)) : undefined,
                maxFeePerGas: hexBig(tx.maxFeePerGas),
                maxPriorityFeePerGas: hexBig(tx.maxPriorityFeePerGas),
              } as any);
            }
            case "wallet_switchEthereumChain": {
              if (Number(params[0]?.chainId) === chainId) return null;
              throw oneChain();
            }
            case "wallet_addEthereumChain":
              throw oneChain();
          }
          if (SIGNING.test(method))
            throw new Error(`${method} is not available with the local key`);
          return node.request({ method, params } as any);
        },
      },
      // A refusal is an answer: asking again would prompt again.
      { retryCount: 0 },
    ),
  });
  return wallet;
}
