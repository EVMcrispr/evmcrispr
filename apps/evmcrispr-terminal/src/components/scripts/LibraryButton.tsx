import { Button, cn } from "@repo/ui";
import type { ElementType, MouseEventHandler } from "react";

type LibraryButtonProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
  icon: ElementType;
  className?: string;
};

export const LibraryButton = ({
  onClick,
  icon: Icon,
  className,
}: LibraryButtonProps) => (
  <div className={cn("-rotate-90 origin-bottom-right top-[20vh]", className)}>
    <Button
      variant="outline"
      size="md"
      onClick={onClick}
      className="gap-2 shadow-none hover:shadow-none hover:translate-y-0 active:translate-y-0 active:translate-x-0"
    >
      <Icon className="w-6 h-6 text-evm-green-300" />
      Library
    </Button>
  </div>
);
