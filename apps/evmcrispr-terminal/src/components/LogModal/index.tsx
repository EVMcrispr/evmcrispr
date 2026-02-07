import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircleIcon,
  ClockIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";

import { Alert, Dialog } from "@repo/ui";

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

export default function LogModal({
  isOpen,
  closeModal,
  logs,
}: {
  isOpen: boolean;
  closeModal: () => void;
  logs: string[];
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <Dialog.Content
        size="xl"
        className="border-evm-yellow-300 [--shadow-color:rgba(226,249,98,0.5)]"
      >
        <Dialog.Header className="bg-black text-evm-yellow-300 border-evm-yellow-300">
          Logs
        </Dialog.Header>
        <div className="overflow-auto w-full h-full min-h-[400px]">
          <div className="flex flex-col gap-10 w-full py-8 px-4">
            <div className="flex flex-col gap-2 w-full">
              {logs.map((log, i) => {
                const _status = status(log);
                const colorClass = statusColorClass[_status];
                const IconComp = statusIcon[_status];
                return (
                  <Alert key={i} status={_status} variant="solid">
                    <div className="flex items-start gap-2">
                      <IconComp className={`w-6 h-6 shrink-0 ${colorClass}`} />
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
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
