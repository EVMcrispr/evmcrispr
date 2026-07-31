import {
  BeakerIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@repo/ui";

const SUGGESTIONS = [
  {
    icon: WalletIcon,
    label: "Build a transfer",
    text: "Write a script that sends 0.1 ETH to three addresses",
  },
  {
    icon: BeakerIcon,
    label: "Simulate safely",
    text: "Validate and simulate the current script, then explain the result",
  },
  {
    icon: ShieldCheckIcon,
    label: "Explain the risks",
    text: "Explain every action in the current script and flag any risks",
  },
];

export function ChatSuggestions({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {SUGGESTIONS.map(({ icon: Icon, label, text }) => (
        <Button
          key={text}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPick(text)}
          className="min-h-11 justify-start gap-2 border-foreground/15 px-3 py-2 font-sans text-xs text-foreground/65 shadow-none"
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  );
}
