import { Button } from "@chakra-ui/react";
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
      isLoading={isPending}
      disabled={isPending}
      onClick={onClick}
      variant="outline-overlay"
      size="lg"
      leftIcon={leftIcon}
      w={"100%"}
    >
      {name}
    </Button>
  );
}
