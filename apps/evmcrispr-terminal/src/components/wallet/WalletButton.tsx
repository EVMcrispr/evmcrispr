import { Button } from "@repo/ui";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";

export default function WalletButton({
  name,
  leftIcon,
  onClick,
}: {
  name: string;
  connector?: Connector;
  leftIcon: React.ReactElement;
  onClick: () => void;
}) {
  const { isPending } = useConnect();
  return (
    <Button
      disabled={isPending}
      onClick={onClick}
      variant="outline"
      size="lg"
      className="w-full gap-2"
    >
      <span className="w-6 h-6 shrink-0 flex items-center justify-center">
        {leftIcon}
      </span>
      {isPending ? "Connecting..." : name}
    </Button>
  );
}
