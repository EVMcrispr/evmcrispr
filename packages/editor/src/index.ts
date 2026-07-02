import { lazy } from "react";

export type { EvmcrisprProviderProps } from "./context/EvmcrisprProvider";
// ── Context ──
export {
  EvmcrisprProvider,
  useEvmlTag,
} from "./context/EvmcrisprProvider";
export type { EvmcrisprTerminalProps } from "./EvmcrisprTerminal";
// ── Composite ──
export { EvmcrisprTerminal } from "./EvmcrisprTerminal";

// ── Editor (Monaco is code-split: importing this entry does not download
//    monaco-editor; the chunk loads when <Editor> first renders) ──
export const Editor = lazy(() => import("./editor/MonacoEditor"));
export type { ConsoleProps } from "./console/Console";
// ── Console & actions preview ──
export { Console } from "./console/Console";
export {
  conf as evmlLanguageConfiguration,
  contribution as evmlLanguageContribution,
  createLanguage as createEvmlMonarchLanguage,
} from "./editor/evml";
export type { CursorRef, EditorProps } from "./editor/MonacoEditor";
export { theme as evmlMonacoTheme } from "./editor/theme";
// ── Shiki grammar / theme ──
export { evmlTheme } from "./grammars/evml-theme";
// ── Hooks ──
export { useDebounce } from "./hooks/useDebounce";
export { useExecutionLogs } from "./hooks/useExecutionLogs";
export { useScriptAnalysis } from "./hooks/useScriptAnalysis";
export { useScriptInterpreter } from "./hooks/useScriptInterpreter";
export { useShiki } from "./hooks/useShiki";
export type { ActionsPreviewProps } from "./preview/ActionsPreview";
export { ActionsPreview } from "./preview/ActionsPreview";
export type { DecodedAction, DecodedArg } from "./preview/decodeAction";
export { decodeAction } from "./preview/decodeAction";
export { DiagnosticsChip } from "./viewer/DiagnosticsChip";
export { HoverPopover } from "./viewer/HoverPopover";
export { evmlTwoslashTransformer } from "./viewer/twoslashTransformer";
export type { ViewerProps } from "./viewer/Viewer";
// ── Viewer ──
export { Viewer } from "./viewer/Viewer";
