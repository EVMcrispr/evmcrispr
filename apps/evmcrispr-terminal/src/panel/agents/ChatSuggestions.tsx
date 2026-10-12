import { Row } from "@repo/ui";
import { FlaskConical, ShieldCheck, Wallet } from "@repo/ui/icons";

const SUGGESTIONS = [
  {
    icon: Wallet,
    label: "Build a transfer",
    text: "Write a script that sends 0.1 ETH to three addresses",
  },
  {
    icon: FlaskConical,
    label: "Simulate safely",
    text: "Validate and simulate the current script, then explain the result",
  },
  {
    icon: ShieldCheck,
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
    <div className="flex flex-col gap-2">
      {SUGGESTIONS.map(({ icon: Icon, label, text }) => (
        <Row
          key={text}
          leading={<Icon aria-hidden className="size-4" />}
          title={label}
          onClick={() => onPick(text)}
        />
      ))}
    </div>
  );
}
