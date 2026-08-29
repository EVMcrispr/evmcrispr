// Expressive Code plugin: `<<<SOL … SOL` heredoc blocks in ```evml fences
// get the same treatment as in the terminal (packages/editor): fence
// tokens take the embedded language's color, and the body lines get a
// colored bar in the left margin plus a faint tint. Same range scanner
// and class names as the editor, so the three surfaces stay in sync.
import { findHeredocRanges, heredocKindClass } from "@evmcrispr/editor/heredoc";

function addClass(node, classes) {
  const props = (node.properties ??= {});
  const existing = Array.isArray(props.className)
    ? props.className
    : typeof props.className === "string"
      ? props.className.split(" ")
      : [];
  props.className = [...existing, ...classes];
}

function classAnnotation(classes, inlineRange) {
  return {
    name: "evml:heredoc",
    inlineRange,
    renderPhase: "normal",
    render: ({ nodesToTransform }) => {
      for (const node of nodesToTransform) addClass(node, classes);
      return nodesToTransform;
    },
  };
}

export function heredocPlugin() {
  return {
    name: "evml-heredoc",
    hooks: {
      postprocessAnalyzedCode({ codeBlock }) {
        if (codeBlock.language !== "evml") return;
        for (const r of findHeredocRanges(codeBlock.code)) {
          const kind = heredocKindClass(r.sentinel);
          const open = codeBlock.getLine(r.startLine - 1);
          open?.addAnnotation(
            classAnnotation(["heredoc-fence", kind], {
              columnStart: r.openCol - 1,
              columnEnd: r.openCol - 1 + 3 + r.sentinel.length,
            }),
          );
          const close = codeBlock.getLine(r.endLine - 1);
          if (close && close !== open) {
            close.addAnnotation(
              classAnnotation(["heredoc-fence", kind], {
                columnStart: 0,
                columnEnd: r.sentinel.length,
              }),
            );
          }
          for (let i = r.startLine; i < r.endLine - 1; i++) {
            codeBlock
              .getLine(i)
              ?.addAnnotation(classAnnotation(["heredoc-block", kind]));
          }
        }
      },
    },
    baseStyles: `
      .heredoc-other { --heredoc-color: #8b8b8b; }
      .heredoc-sol { --heredoc-color: #569cd6; }
      .heredoc-circom { --heredoc-color: #c586c0; }
      .heredoc-noir { --heredoc-color: #3dc9b0; }
      .heredoc-json { --heredoc-color: #dcdcaa; }
      .heredoc-evml { --heredoc-color: #0fff50; }
      :root[data-theme='light'] & .heredoc-sol { --heredoc-color: #2f6fb5; }
      :root[data-theme='light'] & .heredoc-circom { --heredoc-color: #9b4f9a; }
      :root[data-theme='light'] & .heredoc-noir { --heredoc-color: #1f8f7d; }
      :root[data-theme='light'] & .heredoc-json { --heredoc-color: #8a7a1c; }
      :root[data-theme='light'] & .heredoc-evml { --heredoc-color: #0a8f34; }
      .heredoc-fence { color: var(--heredoc-color) !important; }
      .heredoc-block {
        position: relative;
        background: color-mix(in srgb, var(--heredoc-color) 7%, transparent);
      }
      .heredoc-block::before {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        left: calc(var(--ec-codePadInl) - 10px);
        width: 2px;
        background: var(--heredoc-color);
      }
    `,
  };
}
