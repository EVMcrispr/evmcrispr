import { createContext, type ReactNode, useContext } from "react";
import { useWalletConnection } from "../hooks/useWalletConnection";

type Wallet = ReturnType<typeof useWalletConnection>;
const WalletContext = createContext<Wallet | null>(null);

/** `useWalletConnection` holds the wallet modal's state and auto-connects
 *  inside Safe, so it must run once. Components read it from here. */
export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WalletContext.Provider value={useWalletConnection()}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet)
    throw new Error("useWallet must be used inside <WalletProvider>");
  return wallet;
}
