import { useSpace } from "../../app/SpaceContext";
import { ScriptIO } from "../../components/execution/ScriptIO";
import { useScriptInput } from "../../hooks/useScriptInput";
import { useActiveRun } from "../../runs/useRun";

/** What the space's next run reads as stdin. Locked while one runs. */
export function StdinRow() {
  const space = useSpace();
  const { input, setInput } = useScriptInput(space.id);
  const running = useActiveRun() !== null;
  return (
    <div className="shrink-0 border-t border-foreground/10 px-4 py-2">
      <ScriptIO
        key={space.id}
        input={input}
        disabled={running}
        onChange={setInput}
      />
    </div>
  );
}
