import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Drawer, IconButton } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import makeBlockie from "ethereum-blockies-base64";
import { useEffect, useState } from "react";
import { useEnsName } from "wagmi";
import { fetchNexusBalance } from "../../ai/nexus-auth";
import { LibraryTab } from "../panel/LibraryTab";
import { ReferenceTab } from "../panel/ReferenceTab";
import NewScriptButton from "../scripts/NewScriptButton";

type MenuPage = "menu" | "reference";

export function MobileMenu({
  open,
  onOpenChange,
  address,
  onConnect,
  onDisconnect,
  onOpenChatSettings,
  initialPage = "menu",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: `0x${string}` | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenChatSettings: () => void;
  /** Page shown when the drawer opens, e.g. jumping straight to the
   *  reference tab from an "Open in reference" hover action. */
  initialPage?: MenuPage;
}) {
  const [page, setPage] = useState<MenuPage>(initialPage);
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

  const pageTitle = page === "reference" ? "EVML reference" : "Workspace";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" modal>
      <Drawer.Content
        side="bottom"
        className="h-[92dvh] border-foreground/15 bg-[#0b0d0c]"
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-foreground/25" />
        <Drawer.Header className="border-foreground/10">
          <div className="flex items-center gap-2">
            {page !== "menu" && (
              <IconButton
                type="button"
                aria-label="Back to workspace menu"
                variant="ghost"
                size="lg"
                className="min-h-11 min-w-11"
                onClick={() => setPage("menu")}
              >
                <ArrowLeftIcon className="size-5" />
              </IconButton>
            )}
            <div>
              <Drawer.Title className="font-sans text-lg">
                {pageTitle}
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                Scripts, EVML reference and chat settings.
              </Drawer.Description>
            </div>
          </div>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              aria-label="Close workspace menu"
              variant="ghost"
              size="lg"
              className="min-h-11 min-w-11"
            >
              <XMarkIcon className="size-5" />
            </IconButton>
          </Drawer.Close>
        </Drawer.Header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {page === "reference" ? (
            <ReferenceTab />
          ) : (
            <div className="flex h-full flex-col overflow-hidden px-4 py-3">
              {/* Previous scripts fill the top half — the menu's main job is
                  switching scripts, not chrome. */}
              <section
                aria-label="Previous scripts"
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1">
                  <LibraryTab mobile onNavigate={() => onOpenChange(false)} />
                </div>
                <NewScriptButton
                  showLabel
                  onCreated={() => onOpenChange(false)}
                />
              </section>

              <div className="mt-2 flex shrink-0 flex-col gap-1 border-t border-foreground/10 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 justify-start gap-3 px-3 font-sans text-xs shadow-none"
                  onClick={() => setPage("reference")}
                >
                  <DocumentTextIcon data-icon="inline-start" />
                  EVML reference
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 justify-start gap-3 px-3 font-sans text-xs shadow-none"
                  onClick={onOpenChatSettings}
                >
                  <Cog6ToothIcon data-icon="inline-start" />
                  Chat settings
                  {balanceCents != null && (
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      €{(balanceCents / 100).toFixed(2)}
                    </span>
                  )}
                </Button>
              </div>

              <div className="mt-2 flex shrink-0 items-center gap-3 border-t border-foreground/10 pt-3">
                <div
                  role="status"
                  aria-label="Wallet connection"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 font-sans text-xs"
                >
                  {address ? (
                    <>
                      <img
                        src={makeBlockie(address.toLowerCase())}
                        alt=""
                        className="size-6 rounded-sm"
                      />
                      <span className="truncate font-mono text-xs text-foreground/80">
                        {ensName ??
                          `${address.slice(0, 6)}…${address.slice(-4)}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not connected</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0 px-3 font-sans text-xs shadow-none"
                  onClick={() => {
                    if (address) onDisconnect();
                    else onConnect();
                    onOpenChange(false);
                  }}
                >
                  {address ? "Disconnect" : "Connect wallet"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Drawer.Content>
    </Drawer>
  );
}
