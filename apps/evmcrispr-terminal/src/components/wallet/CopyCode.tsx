import { Button } from "@repo/ui";
import { useState } from "react";

export default function CopyCode({ code }: { code: string }) {
  const [hasCopied, setHasCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(code);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="flex mb-2">
      <Button variant="outline" size="sm" onClick={onCopy}>
        {hasCopied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
