import {
  ArrowDownTrayIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  DocumentIcon,
  LinkIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn, IconButton } from "@repo/ui";
import { useEffect, useRef, useState } from "react";
import { downloadOutput } from "../../utils/download-output";

export interface ScriptInputValue {
  name: string;
  text: string;
  /** Set when the input came from the `stdin` link parameter, not a file. */
  source?: "url";
}

const LOCKED = "stdin is locked while the script runs";
const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const byteLength = (text: string) => encoder.encode(text).length;

/** stdin is text: a NUL byte or an invalid UTF-8 sequence means a binary file. */
function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.subarray(0, 8192).includes(0)) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * The script's stdin and stdout in one strip. The user supplies input before
 * execution; scripts cannot open this picker.
 */
export function ScriptIO({
  input,
  onChange,
  disabled,
  output = "",
}: {
  input?: ScriptInputValue;
  onChange: (input: ScriptInputValue | undefined) => void;
  disabled?: boolean;
  output?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const locked = disabled || reading;
  const lines = output.split("\n").length - (output.endsWith("\n") ? 1 : 0);
  const SourceIcon = input?.source === "url" ? LinkIcon : DocumentIcon;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 font-head text-xs">
      {/* stdout drops to its own line rather than squeezing the file name */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <input
          ref={picker}
          type="file"
          className="hidden"
          aria-label="Script input file"
          disabled={disabled}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const request = ++sequence.current;
            setReading(true);
            setError("");
            try {
              const text = decodeText(new Uint8Array(await file.arrayBuffer()));
              if (sequence.current !== request) return;
              if (text === undefined)
                setError(`${file.name} is not UTF-8 text`);
              else onChange({ name: file.name, text });
            } catch (e) {
              if (sequence.current === request)
                setError(e instanceof Error ? e.message : String(e));
            } finally {
              if (sequence.current === request) setReading(false);
            }
          }}
        />
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="shrink-0 text-foreground/40">stdin</span>
          <div
            className={cn(
              "flex min-w-0 items-center rounded-(--radius) border",
              input
                ? "border-foreground/20"
                : "border-dashed border-foreground/30",
            )}
          >
            <button
              type="button"
              disabled={locked}
              title={disabled ? LOCKED : undefined}
              aria-label={
                input ? `Replace stdin file ${input.name}` : "Choose stdin file"
              }
              onClick={() => picker.current?.click()}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 px-2 py-1 text-foreground/70 outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {input ? (
                <>
                  <SourceIcon className="size-3.5 shrink-0" />
                  <span className="truncate" title={input.name}>
                    {input.source === "url" ? "from URL" : input.name}
                  </span>
                  <span className="shrink-0 text-foreground/40">
                    {formatBytes(byteLength(input.text))}
                  </span>
                </>
              ) : (
                <>
                  <PlusIcon className="size-3.5 shrink-0" />
                  <span>{reading ? "reading…" : "input file"}</span>
                </>
              )}
            </button>
            {input && (
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 p-1"
                aria-label="Clear stdin"
                title={disabled ? LOCKED : "Clear stdin"}
                disabled={locked}
                onClick={() => onChange(undefined)}
              >
                <XMarkIcon className="size-3.5" />
              </IconButton>
            )}
          </div>
        </div>
        {output && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-foreground/40">stdout</span>
            <span className="text-foreground/40">
              {`${formatBytes(byteLength(output))} · ${lines} ${lines === 1 ? "line" : "lines"}`}
            </span>
            <div className="flex items-center">
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={copied ? "Copied stdout" : "Copy stdout"}
                title={copied ? "Copied" : "Copy stdout"}
                onClick={() => {
                  void navigator.clipboard.writeText(output);
                  setCopied(true);
                }}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-primary" />
                ) : (
                  <ClipboardDocumentIcon className="size-4" />
                )}
              </IconButton>
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Download stdout"
                title="Download stdout as output.txt"
                onClick={() => downloadOutput(output)}
              >
                <ArrowDownTrayIcon className="size-4" />
              </IconButton>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
