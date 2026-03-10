import { codename, version } from "@evmcrispr/core/package.json";
import { Button } from "@repo/ui";
import makeBlockie from "ethereum-blockies-base64";
import { useState } from "react";
import { Link } from "react-router";
import type { Connector } from "wagmi";
import { useConnect, useConnectors, useDisconnect } from "wagmi";

import logo from "../../assets/logo.svg";
import TypeWriter from "../animations/TypeWriter";
import SelectWalletModal from "../wallet/SelectWalletModal";

export default function TerminalHeader({
  address,
  onDisconnect: onDisconnectCallback,
}: {
  address: `0x${string}` | undefined;
  onDisconnect?: () => void;
}) {
  const { mutate: disconnect } = useDisconnect();
  const { mutate: connect } = useConnect();
  const connectors = useConnectors();
  const safeConnector = connectors.find((c: Connector) => c.id === "safe");

  const [isWalletModalOpen, setWalletModalOpen] = useState(false);

  async function onDisconnect() {
    onDisconnectCallback?.();
    disconnect();
  }
  const addressShortened =
    address && `${address.slice(0, 6)}..${address.slice(-4)}`;

  return (
    <>
      <div className="flex justify-between w-full h-full items-center gap-6 md:gap-0">
        <div className="flex items-center gap-6">
          <Link to="/">
            <img src={logo} alt="Logo" className="h-10" />
          </Link>
          <div className="flex items-center bg-evm-gray-800">
            <div className="w-1.5 h-9 bg-evm-green-300" />
            <span className="hidden md:inline">
              <TypeWriter
                text={`${codename ? ` "${codename}"` : null} v${version}`}
              />
            </span>
            <span className="md:hidden">
              <TypeWriter text={`v${version}`} />
            </span>
          </div>
        </div>
        {address ? (
          <div className="flex items-center gap-3 pr-6">
            <div className="flex items-center border border-evm-green-300 px-2 py-0.5">
              <img
                src={makeBlockie(address.toLowerCase())}
                alt="blockie"
                className="w-4 h-4"
              />
              <span className="ml-3 text-white text-lg font-head mt-0.5">
                {addressShortened}
              </span>
            </div>
            {!safeConnector && (
              <Button
                variant="default"
                className="bg-evm-pink-400 text-evm-gray-900 border-evm-pink-400 hover:bg-evm-pink-300 shadow-destructive"
                onClick={onDisconnect}
                size="sm"
              >
                Disconnect
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="default"
            onClick={
              safeConnector
                ? () => connect({ connector: safeConnector })
                : () => setWalletModalOpen(true)
            }
          >
            Connect
          </Button>
        )}
      </div>
      <SelectWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}
