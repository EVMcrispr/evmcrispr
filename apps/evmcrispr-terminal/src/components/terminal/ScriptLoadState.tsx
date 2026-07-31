import type { EncryptedReason } from "../../hooks/useStoredScript";
import ScriptNotFound from "../scripts/ScriptNotFound";

export type ScriptLoadStateProps = {
  scriptNotFound: boolean;
  ipfsError: boolean;
  ipfsLoading: boolean;
  encryptedError: EncryptedReason | undefined;
  requiredVersion: string | undefined;
};

export function ScriptLoadState({
  scriptNotFound,
  ipfsError,
  ipfsLoading,
  encryptedError,
  requiredVersion,
}: ScriptLoadStateProps) {
  if (encryptedError) {
    return (
      <ScriptNotFound
        variant={`encrypted-${encryptedError}`}
        requiredVersion={requiredVersion}
      />
    );
  }

  if (scriptNotFound || ipfsError) {
    return <ScriptNotFound variant={ipfsError ? "ipfs" : "uuid"} />;
  }

  if (ipfsLoading) {
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
  }

  return null;
}

export function hasScriptLoadState(state: ScriptLoadStateProps) {
  return Boolean(
    state.encryptedError ||
      state.scriptNotFound ||
      state.ipfsError ||
      state.ipfsLoading,
  );
}
