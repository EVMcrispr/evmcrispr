import type { EvmlWorkspace } from "@evmcrispr/core";
import { createEvmlTag } from "./evmcrispr-factory.js";

let workspace: EvmlWorkspace | undefined;

/** Shared long-lived editor workspace for the LSP-style tools, so the
 *  module cache and prewarm state persist across calls. */
export function getWorkspace(): EvmlWorkspace {
  if (!workspace) {
    workspace = createEvmlTag().tag.workspace();
  }
  return workspace;
}
