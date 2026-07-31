import { Button } from "@repo/ui";
import { useConnect } from "wagmi";

export default function WalletButton({
  name,
  leftIcon,
  onClick,
  disabled = false,
}: {
  name: string;
  leftIcon: React.ReactElement;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { isPending } = useConnect();
  return (
    <Button
      disabled={disabled || isPending}
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
