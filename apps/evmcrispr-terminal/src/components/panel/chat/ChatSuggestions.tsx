const SUGGESTIONS = [
  { icon: "🔍", text: "What does the script in my editor do?" },
  { icon: "💰", text: "What's vitalik.eth's ETH balance?" },
  { icon: "✍️", text: "Write a script that sends 0.1 ETH to three addresses" },
  { icon: "📖", text: "How does token:transfer work?" },
];

export function ChatSuggestions({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {SUGGESTIONS.map(({ icon, text }) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="text-left text-xs text-foreground/60 border border-foreground/15 rounded-md px-2.5 py-1.5 hover:bg-foreground/5 hover:text-foreground transition-colors"
        >
          {icon} {text}
        </button>
      ))}
    </div>
  );
}
