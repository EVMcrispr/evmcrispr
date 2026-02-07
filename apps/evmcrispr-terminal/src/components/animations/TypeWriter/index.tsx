export default function TypeWriter({ text }: { text: string }) {
  const duration = text.length / 10;
  return (
    <span
      className="text-white text-sm font-clearer bg-transparent overflow-hidden border-r-[0.5em] border-r-transparent whitespace-nowrap tracking-[0.12em] inline-block"
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
          from { border-color: #fff }
          to { border-color: transparent }
          99% { border-color: #fff }
        }
      `}</style>
      {text}
    </span>
  );
}
