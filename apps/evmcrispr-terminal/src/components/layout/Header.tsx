import { Link } from "react-router-dom";
import { codename, version } from "@1hive/evmcrispr/package.json";
import makeBlockie from "ethereum-blockies-base64";
import type { Connector } from "wagmi";
import { useConnect, useDisconnect } from "wagmi";
import { useState } from "react";

import { Button } from "@repo/ui";

import logo from "../../assets/logo.svg";
import SelectWalletModal from "../wallet/SelectWalletModal";
import TypeWriter from "../animations/TypeWriter";
import { terminalStoreActions } from "../../stores/terminal-store";

export default function TerminalHeader({
  address,
}: {
  address: `0x${string}` | undefined;
}) {
  const { disconnect } = useDisconnect();
  const { connect, connectors } = useConnect();
  const safeConnector = connectors.find((c: Connector) => c.id === "safe");

  const [isWalletModalOpen, setWalletModalOpen] = useState(false);

  async function onDisconnect() {
    terminalStoreActions("errors", []);
    disconnect();
  }
  const addressShortened =
    address && `${address.slice(0, 6)}..${address.slice(-4)}`;

  return (
    <>
      <div className="flex justify-between h-12 mb-12 items-end gap-6 md:gap-0">
        <div className="flex items-end gap-6">
          <Link to="/">
            <img src={logo} alt="Logo" className="w-52" />
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
          <div className="flex flex-col items-end self-end">
            <div className="flex items-center border border-evm-green-300 px-3">
              <img
                src={makeBlockie(address.toLowerCase())}
                alt="blockie"
                className="w-6 h-6"
              />
              <span className="ml-3 text-white text-2xl font-head">
                {addressShortened}
              </span>
            </div>
            {!safeConnector && (
              <Button
                variant="default"
                className="bg-evm-pink-400 text-evm-gray-900 border-evm-pink-400 hover:bg-evm-pink-300 mt-1 shadow-destructive"
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
            size="lg"
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
