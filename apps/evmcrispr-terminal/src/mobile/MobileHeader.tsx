import { fetchNexusBalance } from "@evmcrispr/ai";
import { Button, IconButton } from "@repo/ui";
import { ChevronDown, Menu } from "@repo/ui/icons";
import { useQuery } from "@tanstack/react-query";
import makeBlockie from "ethereum-blockies-base64";
import { Link } from "react-router";
import logo from "../assets/logo.svg";

export function MobileHeader({
  address,
  onConnect,
  onOpenMenu,
}: {
  address: `0x${string}` | undefined;
  onConnect: () => void;
  onOpenMenu: () => void;
}) {
  // Subscribe to the balance ChatPanel already fetches (same query key) —
  // enabled: false keeps this a passive cache reader with no auth logic.
  const { data: balanceCents } = useQuery({
    queryKey: ["nexus-balance"],
    queryFn: fetchNexusBalance,
    enabled: false,
  });
  const shortenedAddress =
    address && `${address.slice(0, 5)}…${address.slice(-4)}`;

  return (
    <header className="mobile-safe-top flex min-h-14 shrink-0 items-center gap-2 border-b-2 border-line bg-surface-0 px-3">
      <IconButton
        type="button"
        aria-label="Open navigation"
        variant="ghost"
        size="lg"
        tooltip={false}
        onClick={onOpenMenu}
      >
        <Menu aria-hidden className="size-5" />
      </IconButton>

      <Link
        to="/"
        className="flex min-w-0 items-center"
        aria-label="EVMcrispr home"
      >
        <img src={logo} alt="EVMcrispr" className="h-8 w-auto" />
      </Link>

      <div className="flex-1" />

      {balanceCents != null && (
        <div className="hidden min-h-10 items-center gap-1.5 rounded-(--radius) border-2 border-line bg-surface-1 px-2.5 font-sans text-caption tabular-nums text-fg-muted min-[360px]:flex">
          <img
            src="/dappnode-logo.svg"
            alt="DappNode Nexus"
            className="size-4"
          />
          €{(balanceCents / 100).toFixed(2)}
        </div>
      )}

      {address ? (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="gap-2 px-2.5"
          onClick={onOpenMenu}
          aria-label={`Wallet ${shortenedAddress}`}
        >
          <img
            src={makeBlockie(address.toLowerCase())}
            alt=""
            className="size-5"
          />
          <span className="hidden min-[390px]:inline">{shortenedAddress}</span>
          <ChevronDown aria-hidden data-icon="inline-end" />
        </Button>
      ) : (
        <Button type="button" variant="primary" size="sm" onClick={onConnect}>
          Connect
        </Button>
      )}
    </header>
  );
}
