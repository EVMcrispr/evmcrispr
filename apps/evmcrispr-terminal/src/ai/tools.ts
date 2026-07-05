import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { EvmlTag } from "@evmcrispr/core";
import type { Address } from "viem";
import { z } from "zod";

import {
  applyStrReplace,
  getActiveModel,
  replaceScript,
} from "../hooks/useEditorModels";
import {
  terminalStoreActions,
  terminalStoreGet,
} from "../stores/terminal-store";

function currentScript(): string {
  // In view mode the Monaco editor is unmounted; the store holds the script.
  return getActiveModel()?.getValue() ?? terminalStoreGet("script");
}

/**
 * The Monaco editor is only mounted in edit mode (view mode renders a
 * read-only Viewer instead). Before writing, switch the terminal to edit
 * mode and wait for the lazy-loaded editor to mount.
 */
async function ensureEditorMounted(): Promise<boolean> {
  if (getActiveModel()) return true;
  terminalStoreActions("viewMode", "edit");
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (getActiveModel()) return true;
  }
  return false;
}

const EDITOR_UNAVAILABLE =
  "ERROR: The editor could not be opened. Ask the user to switch the terminal to edit mode, then retry.";

function numbered(src: string): string {
  return src
    .split("\n")
    .map((line, i) => `${i + 1}\t${line}`)
    .join("\n");
}

/** Simulation actions contain viem BigInts, which JSON.stringify rejects. */
function json(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

async function validateCurrent(tag: EvmlTag) {
  const { diagnostics, valid } = await tag.script(currentScript()).validate();
  return {
    valid,
    diagnostics: diagnostics.map((d) => ({
      line: d.line,
      col: d.col,
      severity: d.severity,
      message: d.message,
    })),
  };
}

/**
 * Tools the chat assistant can use against the editor and the evml tag.
 * Factory so the (React-context-provided) tag reaches non-React closures.
 */
export function createChatTools(tag: EvmlTag) {
  const getScript = betaZodTool({
    name: "get_script",
    description:
      "Read the current EVML script in the editor. Returns the content with line numbers (tab-separated). Always read the script before editing it.",
    inputSchema: z.object({}),
    run: async () => numbered(currentScript()),
  });

  const editScript = betaZodTool({
    name: "edit_script",
    description:
      "Edit the script by exact string replacement. old_string must match the current script content exactly once (raw text, without line numbers). The result includes validation diagnostics for the script after the edit — fix any errors before finishing.",
    inputSchema: z.object({
      old_string: z
        .string()
        .describe("Exact text to replace (must be unique in the script)"),
      new_string: z.string().describe("Replacement text"),
    }),
    run: async ({ old_string, new_string }) => {
      if (!(await ensureEditorMounted())) return EDITOR_UNAVAILABLE;
      const res = applyStrReplace(old_string, new_string);
      if (!res.ok) return `ERROR: ${res.error}`;
      return `Edit applied.\nValidation: ${json(await validateCurrent(tag))}`;
    },
  });

  const writeScript = betaZodTool({
    name: "write_script",
    description:
      "Replace the entire script. Prefer edit_script for small changes. The result includes validation diagnostics for the new script.",
    inputSchema: z.object({
      content: z.string().describe("The full new script content"),
    }),
    run: async ({ content }) => {
      if (!(await ensureEditorMounted())) return EDITOR_UNAVAILABLE;
      const res = replaceScript(content);
      if (!res.ok) return `ERROR: ${res.error}`;
      return `Script written.\nValidation: ${json(await validateCurrent(tag))}`;
    },
  });

  const validateScript = betaZodTool({
    name: "validate_script",
    description:
      "Validate the current editor script (syntax and static semantics). Runs offline; sends no transactions.",
    inputSchema: z.object({}),
    run: async () => json(await validateCurrent(tag)),
  });

  const simulateScript = betaZodTool({
    name: "simulate_script",
    description:
      "Simulate an EVML script on a chain fork: the current editor script, or `script` if given. Returns a success flag, per-action logs, and the resolved actions. `print` output appears in the logs, so a throwaway `print` script doubles as an on-chain read (balances, ENS names, any helper value) without touching the editor. Slow (can take several seconds); nothing is broadcast on-chain.",
    inputSchema: z.object({
      script: z
        .string()
        .optional()
        .describe(
          "Script to simulate instead of the editor content (e.g. a `print` one-liner to read on-chain values)",
        ),
      from: z
        .string()
        .optional()
        .describe("Address to simulate from (defaults to the fork default)"),
      blockNumber: z.number().optional().describe("Fork at this block number"),
    }),
    run: async ({ script, from, blockNumber }) => {
      const result = await tag.script(script ?? currentScript()).simulate({
        from: from as Address | undefined,
        blockNumber,
      });
      return json({
        success: result.success,
        error: result.error,
        logs: result.logs,
        actions: result.actions,
      });
    },
  });

  return [getScript, editScript, writeScript, validateScript, simulateScript];
}
