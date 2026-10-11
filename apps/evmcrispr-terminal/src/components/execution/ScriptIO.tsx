import { Button, cn, IconButton, Input } from "@repo/ui";
import {
  Check,
  ClipboardCopy,
  Download,
  File as FileIcon,
  Link,
  Plus,
  X,
} from "@repo/ui/icons";
import { useEffect, useRef, useState } from "react";
import type { ScriptInputValue } from "../../app/ui-store";
import { downloadOutput } from "../../utils/download-output";

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
  const SourceIcon = input?.source === "url" ? Link : FileIcon;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 font-head text-caption">
      {/* stdout drops to its own line rather than squeezing the file name */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Input
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
          <span className="shrink-0 text-fg-faint">stdin</span>
          <div
            className={cn(
              "flex min-w-0 items-center rounded-(--radius) border",
              input ? "border-line" : "border-dashed border-edge",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="row"
              disabled={locked}
              title={disabled ? LOCKED : undefined}
              aria-label={
                input ? `Replace stdin file ${input.name}` : "Choose stdin file"
              }
              onClick={() => picker.current?.click()}
              className="min-w-0 text-fg-muted"
            >
              {input ? (
                <>
                  <SourceIcon aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate" title={input.name}>
                    {input.source === "url" ? "from URL" : input.name}
                  </span>
                  <span className="shrink-0 text-fg-faint">
                    {formatBytes(byteLength(input.text))}
                  </span>
                </>
              ) : (
                <>
                  <Plus aria-hidden className="size-3.5 shrink-0" />
                  <span>{reading ? "reading…" : "input file"}</span>
                </>
              )}
            </Button>
            {input && (
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Clear stdin"
                tooltip={disabled ? LOCKED : "Clear stdin"}
                disabled={locked}
                onClick={() => onChange(undefined)}
              >
                <X aria-hidden className="size-3.5" />
              </IconButton>
            )}
          </div>
        </div>
        {output && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-fg-faint">stdout</span>
            <span className="text-fg-faint">
              {`${formatBytes(byteLength(output))} · ${lines} ${lines === 1 ? "line" : "lines"}`}
            </span>
            <div className="flex items-center">
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={copied ? "Copied stdout" : "Copy stdout"}
                tooltip={copied ? "Copied" : "Copy stdout"}
                onClick={() => {
                  void navigator.clipboard.writeText(output);
                  setCopied(true);
                }}
              >
                {copied ? (
                  <Check aria-hidden className="size-4 text-success" />
                ) : (
                  <ClipboardCopy aria-hidden className="size-4" />
                )}
              </IconButton>
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Download stdout"
                tooltip="Download stdout as output.txt"
                onClick={() => downloadOutput(output)}
              >
                <Download aria-hidden className="size-4" />
              </IconButton>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
