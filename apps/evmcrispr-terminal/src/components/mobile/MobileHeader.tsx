import { fetchNexusBalance } from "@evmcrispr/ai";
import { Bars3Icon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { Button, IconButton } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import makeBlockie from "ethereum-blockies-base64";
import { Link } from "react-router";
import logo from "../../assets/logo.svg";

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
    <header className="mobile-safe-top flex min-h-14 shrink-0 items-center gap-2 border-b border-foreground/10 bg-background/92 px-3 backdrop-blur">
      <IconButton
        type="button"
        aria-label="Open navigation"
        variant="ghost"
        size="lg"
        className="min-h-11 min-w-11"
        onClick={onOpenMenu}
      >
        <Bars3Icon className="size-5" />
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
        <div className="hidden min-h-10 items-center gap-1.5 border border-foreground/15 bg-foreground/[0.035] px-2.5 font-sans text-xs tabular-nums text-foreground/70 min-[360px]:flex">
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
          variant="outline"
          size="sm"
          className="min-h-11 gap-2 border-foreground/15 px-2.5 font-sans text-xs shadow-none"
          onClick={onOpenMenu}
          aria-label={`Wallet ${shortenedAddress}`}
        >
          <img
            src={makeBlockie(address.toLowerCase())}
            alt=""
            className="size-5 rounded-sm"
          />
          <span className="hidden min-[390px]:inline">{shortenedAddress}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="min-h-11 px-3 font-sans text-xs shadow-none"
          onClick={onConnect}
        >
          Connect
        </Button>
      )}
    </header>
  );
}
