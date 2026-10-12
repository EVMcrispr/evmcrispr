import { Button, PixelArt } from "@repo/ui";
import { useNavigate } from "react-router";

const variants = {
  uuid: {
    title: "404: Alien DNA Detected",
    art: "helix",
    lines: [
      "This script sequence doesn't exist in your local gene pool.",
      "Ask your friend to share a valid link with you.",
    ],
  },
  ipfs: {
    title: "Broken Vial Detected",
    art: "broken-vial",
    lines: [
      "The DNA sample couldn't be transmitted from the remote gene bank.",
      "The IPFS link may be expired or the gateway unreachable.",
    ],
  },
  "encrypted-missing-key": {
    title: "Sealed Vial Detected",
    art: "sealed-vial",
    lines: [
      "This script is encrypted, but the link is missing its decryption key.",
      "Ask the sender for the full link, including the part after the last #.",
    ],
  },
  "encrypted-invalid-key": {
    title: "Key Rejected",
    art: "sealed-vial",
    lines: [
      "The decryption key in this link doesn't match the sealed script.",
      "The link may have been truncated or altered — ask the sender to reshare it.",
    ],
  },
  "encrypted-needs-upgrade": {
    title: "Future Formula Detected",
    art: "sealed-vial",
    lines: [
      "This script was sealed with a newer version of EVMcrispr.",
      "Update EVMcrispr to open it.",
    ],
  },
  "export-refused": {
    title: "Sample Rejected",
    art: "broken-vial",
    lines: [
      "This link holds an exported space that this version of EVMcrispr does not take in.",
      "Nothing was restored or changed.",
    ],
  },
} as const;

export type ScriptNotFoundVariant = keyof typeof variants;

export default function ScriptNotFound({
  variant,
  requiredVersion,
  why,
}: {
  variant: ScriptNotFoundVariant;
  requiredVersion?: string;
  /** For "export-refused": what is wrong with it, as text. */
  why?: string;
}) {
  const navigate = useNavigate();
  const { title, art, lines: defaultLines } = variants[variant];
  const lines: readonly string[] =
    variant === "encrypted-needs-upgrade" && requiredVersion
      ? [
          defaultLines[0],
          `Update to EVMcrispr >= ${requiredVersion} to open it.`,
        ]
      : variant === "export-refused" && why
        ? [defaultLines[0], `The reason: ${why}.`, defaultLines[1]]
        : defaultLines;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-6 select-none animate-fade-in">
      <PixelArt name={art} />

      <div className="flex flex-col items-center gap-3 max-w-md text-center">
        <h2 className="m-0 text-heading font-head text-display tracking-wide">
          {title}
        </h2>
        {lines.map((line) => (
          <p key={line} className="m-0 text-fg-muted font-mono text-body">
            {line}
          </p>
        ))}
      </div>

      <Button variant="neutral" onClick={() => navigate("/")}>
        New space
      </Button>
    </div>
  );
}
