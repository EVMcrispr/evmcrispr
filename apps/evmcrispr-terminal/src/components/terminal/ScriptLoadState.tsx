import type { SpaceRoute } from "../../app/useSpaceRoute";
import ScriptNotFound from "../scripts/ScriptNotFound";

/** What the script area shows while the address has no space on screen. */
export function ScriptLoadState({ route }: { route: SpaceRoute }) {
  switch (route.status) {
    case "encrypted":
      return (
        <ScriptNotFound
          variant={`encrypted-${route.reason}`}
          requiredVersion={route.requiredVersion}
        />
      );
    case "not-found":
      return <ScriptNotFound variant="uuid" />;
    case "ipfs-error":
      return <ScriptNotFound variant="ipfs" />;
    case "loading":
      if (!route.ipfs) return <div className="h-full" role="status" />;
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-4 select-none animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <div className="size-8 animate-spin rounded-full border-2 border-evm-green-300/30 border-t-evm-green-300" />
          <p className="font-head text-sm tracking-wide text-evm-green-300">
            Fetching DNA sequence from IPFS...
          </p>
        </div>
      );
    default:
      return null;
  }
}
