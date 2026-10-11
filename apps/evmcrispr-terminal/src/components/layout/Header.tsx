import { version as baseVersion, codename } from "@evmcrispr/core/package.json";
import { Button } from "@repo/ui";
import makeBlockie from "ethereum-blockies-base64";
import { useState } from "react";
import { Link } from "react-router";
import type { Connector } from "wagmi";
import { useConnect, useConnectors, useDisconnect } from "wagmi";

import logo from "../../assets/logo.svg";
import { useWallet } from "../../wallet/WalletContext";
import TypeWriter from "../animations/TypeWriter";
import SelectWalletModal from "../wallet/SelectWalletModal";

const experimentalOn =
  import.meta.env.VITE_PUBLIC_EXPERIMENTAL === "true" ||
  import.meta.env.VITE_PUBLIC_EXPERIMENTAL === "1";
const version = experimentalOn ? `${baseVersion}-experimental` : baseVersion;

export default function TerminalHeader() {
  const { address } = useWallet();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: connect } = useConnect();
  const connectors = useConnectors();
  const safeConnector = connectors.find((c: Connector) => c.id === "safe");

  const [isWalletModalOpen, setWalletModalOpen] = useState(false);

  const onDisconnect = () => disconnect();
  const addressShortened =
    address && `${address.slice(0, 6)}..${address.slice(-4)}`;

  return (
    <>
      <div className="flex justify-between w-full h-full items-center gap-6 md:gap-0">
        <div className="flex items-end gap-6">
          <Link to="/">
            <img src={logo} alt="Logo" className="h-14" />
          </Link>
          <div className="flex items-end mb-[-5px]">
            <span className="hidden md:inline">
              <TypeWriter
                text={`${codename ? ` "${codename}"` : null} v${version}`}
                className="text-heading"
              />
            </span>
            <span className="md:hidden">
              <TypeWriter text={`v${version}`} className="text-heading" />
            </span>
          </div>
        </div>
        {address ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-(--radius) border-2 border-edge bg-surface-1 px-2.5 py-1">
              <img
                src={makeBlockie(address.toLowerCase())}
                alt=""
                className="size-4"
              />
              <span className="font-head text-body text-fg">
                {addressShortened}
              </span>
            </div>
            {!safeConnector && (
              <Button variant="quiet" onClick={onDisconnect} size="sm">
                Disconnect
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="primary"
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
