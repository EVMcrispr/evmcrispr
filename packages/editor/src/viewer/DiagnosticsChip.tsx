import type { ParseDiagnostic } from "@evmcrispr/core";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { useState } from "react";

type DiagnosticsChipProps = {
  diagnostics: ParseDiagnostic[];
};

/**
 * Compact replacement for Monaco's red squiggles. Shows a count chip
 * above the script — tap to expand a list of `line:col — message` rows
 * so the user can locate the issue without an editor.
 */
export function DiagnosticsChip({ diagnostics }: DiagnosticsChipProps) {
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) return null;

  const count = diagnostics.length;

  return (
    <div className="shrink-0 px-3 py-2 border-b border-evm-orange-400/30 bg-evm-orange-800/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-evm-orange-300 text-xs font-head w-full text-left"
        aria-expanded={open}
      >
        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
        <span>
          {count} {count === 1 ? "issue" : "issues"} in script
        </span>
        <span className="ml-auto opacity-60">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-xs text-foreground/80">
          {diagnostics.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-evm-orange-300 font-mono shrink-0">
                {d.line}:{d.col + 1}
              </span>
              <span>{d.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
