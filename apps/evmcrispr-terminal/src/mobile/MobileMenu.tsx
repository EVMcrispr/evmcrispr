import { fetchNexusBalance } from "@evmcrispr/ai";
import { BackButton, Badge, Button, Overlay, Row } from "@repo/ui";
import { Boxes, FileText, Settings } from "@repo/ui/icons";
import { useQuery } from "@tanstack/react-query";
import makeBlockie from "ethereum-blockies-base64";
import { useEffect, useState } from "react";
import { useEnsName } from "wagmi";
import NewScriptButton from "../components/scripts/NewScriptButton";
import { ReferenceTab } from "../panel/reference/ReferenceTab";
import { useWallet } from "../wallet/WalletContext";

type MenuPage = "menu" | "reference";

export function MobileMenu({
  open,
  onOpenChange,
  onOpenChatSettings,
  onOpenSpaces,
  initialPage = "menu",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChatSettings: () => void;
  /** Goes to the list of spaces. */
  onOpenSpaces: () => void;
  /** Page shown when the drawer opens, e.g. jumping straight to the
   *  reference tab from an "Open in docs" hover action. */
  initialPage?: MenuPage;
}) {
  const { address, connectWallet, disconnect } = useWallet();
  const [page, setPage] = useState<MenuPage>(initialPage);
  const [entryOpen, setEntryOpen] = useState(false);
  // Passive reader of the balance ChatPanel fetches (shared query key).
  const { data: balanceCents } = useQuery({
    queryKey: ["nexus-balance"],
    queryFn: fetchNexusBalance,
    enabled: false,
  });
  // ENS lives on mainnet regardless of the wallet's current chain.
  const { data: ensName } = useEnsName({ address, chainId: 1 });

  useEffect(() => {
    if (open) setPage(initialPage);
  }, [open, initialPage]);

  const pageTitle = page === "reference" ? "EVML docs" : "EVMcrispr";

  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      sheet
      tone="brand"
      title={pageTitle}
      description="Spaces, EVML docs and chat settings."
      closeLabel="Close menu"
    >
      {page === "reference" ? (
        <>
          {/* An entry has its own way back, to the list. This one stands
              where that one does. */}
          {!entryOpen && (
            <div className="flex min-h-11 shrink-0 items-center py-1.5">
              <BackButton label="Menu" onClick={() => setPage("menu")} />
            </div>
          )}
          <ReferenceTab flush onEntryChange={setEntryOpen} />
        </>
      ) : (
        <>
          <section aria-label="Spaces" className="flex flex-col gap-2">
            <Row
              leading={<Boxes aria-hidden className="size-4 text-fg-muted" />}
              title="Spaces"
              onClick={onOpenSpaces}
            />
            <NewScriptButton showLabel onCreated={() => onOpenChange(false)} />
          </section>

          <div className="flex flex-col gap-2">
            <Row
              leading={
                <FileText aria-hidden className="size-4 text-fg-muted" />
              }
              title="EVML docs"
              onClick={() => setPage("reference")}
            />
            <Row
              leading={
                <Settings aria-hidden className="size-4 text-fg-muted" />
              }
              title="Chat settings"
              meta={
                balanceCents != null ? (
                  <Badge>€{(balanceCents / 100).toFixed(2)}</Badge>
                ) : undefined
              }
              onClick={onOpenChatSettings}
            />
          </div>

          <div className="flex items-center gap-3 border-t-2 border-line pt-3">
            <div
              role="status"
              aria-label="Wallet connection"
              className="flex min-w-0 flex-1 items-center gap-2 font-sans text-caption"
            >
              {address ? (
                <>
                  <img
                    src={makeBlockie(address.toLowerCase())}
                    alt=""
                    className="size-6"
                  />
                  <span className="truncate font-mono text-fg-muted">
                    {ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`}
                  </span>
                </>
              ) : (
                <span className="text-fg-faint">Not connected</span>
              )}
            </div>
            <Button
              type="button"
              // Connecting is what the menu asks for; disconnecting is not.
              variant={address ? "neutral" : "primary"}
              size="sm"
              className="shrink-0"
              onClick={() => {
                if (address) disconnect();
                else connectWallet();
                onOpenChange(false);
              }}
            >
              {address ? "Disconnect" : "Connect wallet"}
            </Button>
          </div>
        </>
      )}
    </Overlay>
  );
}
