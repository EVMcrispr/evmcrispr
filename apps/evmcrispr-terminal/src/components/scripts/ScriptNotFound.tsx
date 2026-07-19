import { Button } from "@repo/ui";
import { useNavigate } from "react-router";

import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
} from "../../stores/terminal-store";
import { getOrCreatePristineScript, setLastViewedScript } from "../../utils";

const DNA_HELIX = `    ╱╲
   ╱  ╲
  ╱ ×× ╲
  ╲ ×× ╱
   ╲  ╱
    ╲╱
    ╱╲
   ╱  ╲
  ╱ ×× ╲
  ╲ ×× ╱
   ╲  ╱
    ╲╱`;

const BROKEN_VIAL = `    ┌──┐
    │  │
    │~~│
    │  │
    └┐ │
     │╱
     ╳
    ╱ ╲
   ╱   ╲
  ~ ~ ~ ~`;

const SEALED_VIAL = `    ┌──┐
   ┌┤××├┐
   ││  ││
   ││~~││
   ││~~││
   ││  ││
   └┴──┴┘
    ╔══╗
    ║ ○║
    ╚══╝`;

const variants = {
  uuid: {
    title: "404: Alien DNA Detected",
    art: DNA_HELIX,
    lines: [
      "This script sequence doesn't exist in your local gene pool.",
      "Ask your friend to share a valid link with you.",
    ],
  },
  ipfs: {
    title: "Broken Vial Detected",
    art: BROKEN_VIAL,
    lines: [
      "The DNA sample couldn't be transmitted from the remote gene bank.",
      "The IPFS link may be expired or the gateway unreachable.",
    ],
  },
  "encrypted-missing-key": {
    title: "Sealed Vial Detected",
    art: SEALED_VIAL,
    lines: [
      "This script is encrypted, but the link is missing its decryption key.",
      "Ask the sender for the full link, including the part after the last #.",
    ],
  },
  "encrypted-invalid-key": {
    title: "Key Rejected",
    art: SEALED_VIAL,
    lines: [
      "The decryption key in this link doesn't match the sealed script.",
      "The link may have been truncated or altered — ask the sender to reshare it.",
    ],
  },
  "encrypted-needs-upgrade": {
    title: "Future Formula Detected",
    art: SEALED_VIAL,
    lines: [
      "This script was sealed with a newer version of EVMcrispr.",
      "Update EVMcrispr to open it.",
    ],
  },
} as const;

export type ScriptNotFoundVariant = keyof typeof variants;

export default function ScriptNotFound({
  variant,
  requiredVersion,
}: {
  variant: ScriptNotFoundVariant;
  requiredVersion?: string;
}) {
  const navigate = useNavigate();
  const { title, art, lines: defaultLines } = variants[variant];
  const lines: readonly string[] =
    variant === "encrypted-needs-upgrade" && requiredVersion
      ? [
          defaultLines[0],
          `Update to EVMcrispr >= ${requiredVersion} to open it.`,
        ]
      : defaultLines;

  function handleNewScript() {
    const id = getOrCreatePristineScript(SCRIPT_PLACEHOLDER);
    terminalStoreActions("currentScriptId", id);
    terminalStoreActions("title", "");
    terminalStoreActions("script", SCRIPT_PLACEHOLDER);
    setLastViewedScript(id);
    navigate(`/${id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-6 select-none animate-fade-in">
      <pre className="text-evm-green-300 text-sm leading-tight font-mono opacity-60">
        {art}
      </pre>

      <div className="flex flex-col items-center gap-3 max-w-md text-center">
        <h2 className="text-evm-green-300 font-head text-2xl tracking-wide">
          {title}
        </h2>
        {lines.map((line) => (
          <p key={line} className="text-foreground/60 font-mono text-sm">
            {line}
          </p>
        ))}
      </div>

      <Button variant="outline" onClick={handleNewScript}>
        New Script
      </Button>
    </div>
  );
}
