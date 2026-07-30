# @evmcrispr/editor

[![](https://img.shields.io/npm/v/@evmcrispr/editor.svg?logo=npm)](https://www.npmjs.com/package/@evmcrispr/editor)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

Embeddable React components for editing and running **EVML** scripts — the editor that powers the terminal at [evmcrispr.com](https://evmcrispr.com). Monaco-based, with syntax highlighting, autocompletion, hover docs, inline diagnostics and rename support wired to `@evmcrispr/core`'s workspace API.

## Quick start

```sh
bun add @evmcrispr/editor @evmcrispr/core react react-dom viem
```

```tsx
import { EvmcrisprProvider, EvmcrisprTerminal } from "@evmcrispr/editor";
import "@evmcrispr/editor/style.css";

export function App() {
  return (
    <EvmcrisprProvider>
      <EvmcrisprTerminal />
    </EvmcrisprProvider>
  );
}
```

For finer-grained embedding, the pieces are exported individually: the lazy `Editor` (Monaco), `Console`, `ActionsPreview`, the `evmlMonacoTheme`/`evmlTheme` themes, the EVML TextMate grammar (`@evmcrispr/editor/grammars/evml`), and hooks like `useScriptAnalysis`, `useScriptInterpreter` and `useExecutionLogs`.

`react`, `react-dom` and `viem` are peer dependencies. `monaco-editor` is pinned to 0.56.0.

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.
