export default function TypeWriter({
  text,
  className = "text-fg",
}: {
  text: string;
  className?: string;
}) {
  const duration = text.length / 10;
  return (
    <span
      className={`${className} text-body leading-none font-clearer bg-transparent overflow-hidden border-r-[0.5em] border-r-transparent whitespace-nowrap tracking-[0.12em] inline-block`}
      style={{
        animation: `typing ${duration}s steps(40, end), blinkCaret ${duration}s step-end 1`,
      }}
    >
      <style>{`
        @keyframes typing {
          from { width: 0 }
          to { width: 100% }
        }
        @keyframes blinkCaret {
          from { border-color: currentColor }
          to { border-color: transparent }
          99% { border-color: currentColor }
        }
      `}</style>
      {text}
    </span>
  );
}
