import { PixelArt } from "@repo/ui";
import type { SpaceRoute } from "../../app/useSpaceRoute";
import { RestorePrompt } from "../../panel/space/RestorePrompt";
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
    case "export":
      // Keyed by the link: another link is another question.
      return (
        <RestorePrompt
          key={`${route.exported.id}:${route.exported.cid}`}
          exported={route.exported}
        />
      );
    case "refused":
      return <ScriptNotFound variant="export-refused" why={route.why} />;
    case "not-found":
      return <ScriptNotFound variant="uuid" />;
    case "ipfs-error":
      return <ScriptNotFound variant="ipfs" />;
    case "loading":
      if (!route.ipfs) return <div className="h-full" role="status" />;
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-4 select-none animate-fade-in text-heading"
          role="status"
          aria-live="polite"
        >
          <PixelArt name="helix" turning />
          <p className="m-0 font-head text-body tracking-wide">
            Fetching DNA sequence from IPFS...
          </p>
        </div>
      );
    default:
      return null;
  }
}
