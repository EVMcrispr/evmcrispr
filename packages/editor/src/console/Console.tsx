import {
  CheckCircleIcon,
  ClockIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert } from "../ui/Alert";

type LogStatus = "success" | "error" | "warning" | "info";

const status = (log: string): LogStatus => {
  return log.startsWith(":success:")
    ? "success"
    : log.startsWith(":error:")
      ? "error"
      : log.startsWith(":waiting:")
        ? "warning"
        : "info";
};

const stripString = (log: string): string => {
  return log.startsWith(":success:")
    ? log.slice(":success:".length)
    : log.startsWith(":error:")
      ? log.slice(":error:".length)
      : log.startsWith(":waiting:")
        ? log.slice(":waiting:".length)
        : log;
};

const statusColorClass: Record<LogStatus, string> = {
  error: "text-evm-orange-300",
  success: "text-evm-green-300",
  warning: "text-evm-blue-300",
  info: "text-evm-yellow-300",
};

const statusIcon: Record<LogStatus, typeof XCircleIcon> = {
  error: XCircleIcon,
  success: CheckCircleIcon,
  warning: ClockIcon,
  info: InformationCircleIcon,
};

export interface ConsoleProps {
  logs: string[];
  errors: string[];
  /** Shown when there are no logs or errors yet. */
  placeholder?: string;
}

export function Console({
  logs,
  errors,
  placeholder = "Console output will appear here during execution.",
}: ConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const hasContent = logs.length > 0 || errors.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-2">
      {!hasContent && (
        <p className="text-foreground/40 font-head text-sm p-4">
          {placeholder}
        </p>
      )}
      {logs.map((log, i) => {
        const _status = status(log);
        const colorClass = statusColorClass[_status];
        const IconComp = statusIcon[_status];
        return (
          <Alert key={`log-${i}`} status={_status} variant="solid">
            <div className="flex items-start gap-2">
              <IconComp className={`w-5 h-5 shrink-0 ${colorClass}`} />
              <Alert.Description className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-evm-green-300 underline"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {stripString(log)}
                </ReactMarkdown>
              </Alert.Description>
            </div>
          </Alert>
        );
      })}
      {errors.map((e, i) => (
        <Alert key={`err-${i}`} status="error">
          <div className="flex items-start gap-2">
            <XCircleIcon className="w-5 h-5 shrink-0 text-white" />
            <Alert.Description className="break-all">{e}</Alert.Description>
          </div>
        </Alert>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
