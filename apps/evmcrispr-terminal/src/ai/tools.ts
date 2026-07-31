import type { EvmlTag } from "@evmcrispr/core";
import { getConnection } from "@wagmi/core";
import { type ToolSet, tool } from "ai";
import type { Address } from "viem";
import { z } from "zod";

import { config as wagmiConfig } from "../config/wagmi";
import { workerEvml } from "../evml/workerEvml";

import { getActiveModel } from "../hooks/useEditorModels";
import {
  terminalStoreActions,
  terminalStoreGet,
} from "../stores/terminal-store";
import { applyAiStrReplace, applyAiWriteScript } from "../utils/script-edits";
import { createContractTools } from "./contract-tools";
import {
  getModuleOverview,
  loadCommandDocs,
  loadHelperDocs,
  loadModuleDocs,
  MODULES,
} from "./docs";
import { createWebTools } from "./web-tools";

function currentScript(): string {
  // In view mode the Monaco editor is unmounted; the store holds the script.
  return getActiveModel()?.getValue() ?? terminalStoreGet("script");
}

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

function serializable(value: unknown): unknown {
  return JSON.parse(json(value));
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
export function createChatTools(tag: EvmlTag): ToolSet {
  const getScript = tool({
    description:
      "Read the current EVML script in the editor. Returns the script title and the content with line numbers (tab-separated). Always read the script before editing it.",
    inputSchema: z.object({}),
    execute: async () =>
      `Title: ${terminalStoreGet("title") || "(untitled)"}\n\n${numbered(currentScript())}`,
  });

  const editScript = tool({
    description:
      "Edit the script by exact string replacement. old_string must match the current script content exactly once (raw text, without line numbers). The result includes validation diagnostics for the script after the edit — fix any errors before finishing.",
    inputSchema: z.object({
      old_string: z
        .string()
        .describe("Exact text to replace (must be unique in the script)"),
      new_string: z.string().describe("Replacement text"),
    }),
    execute: async ({ old_string, new_string }) => {
      const res = applyAiStrReplace(old_string, new_string);
      if (!res.ok) {
        return { kind: "script-change", ok: false, error: res.error };
      }
      return {
        kind: "script-change",
        ok: true,
        operation: "edit",
        revisionId: res.revisionId,
        validation: await validateCurrent(tag),
      };
    },
  });

  const writeScript = tool({
    description:
      "Replace the entire script. Prefer edit_script for small changes. The result includes validation diagnostics for the new script.",
    inputSchema: z.object({
      content: z.string().describe("The full new script content"),
    }),
    execute: async ({ content }) => {
      const res = applyAiWriteScript(content);
      if (!res.ok) {
        return { kind: "script-change", ok: false, error: res.error };
      }
      return {
        kind: "script-change",
        ok: true,
        operation: "write",
        revisionId: res.revisionId,
        validation: await validateCurrent(tag),
      };
    },
  });

  const setScriptTitle = tool({
    description:
      "Set the script title shown above the editor and in the library. Use it whenever the script is untitled or the current title no longer reflects what the script does. Titles should be a few words describing the script's overall purpose — broad enough that small edits to the script don't require renaming it.",
    inputSchema: z.object({
      title: z.string().describe("New script title (a few words)"),
    }),
    execute: async ({ title }) => {
      terminalStoreActions("title", title.trim());
      return { kind: "title-change", ok: true, title: title.trim() };
    },
  });

  const validateScript = tool({
    description:
      "Validate the current editor script (syntax and static semantics). Runs offline; sends no transactions.",
    inputSchema: z.object({}),
    execute: async () => ({
      kind: "validation",
      ...(await validateCurrent(tag)),
    }),
  });

  const simulateScript = tool({
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
        .describe(
          "Address to simulate from (defaults to the connected wallet account)",
        ),
      blockNumber: z.number().optional().describe("Fork at this block number"),
    }),
    execute: async ({ script, from, blockNumber }) => {
      // Runs in the EVML worker so a heavy fork simulation (ethereumjs VM)
      // can't freeze the UI while the chat waits on it.
      const result = await workerEvml
        .script(script ?? currentScript())
        .simulate({
          from:
            (from as Address | undefined) ?? getConnection(wagmiConfig).address,
          blockNumber,
        });
      return serializable({
        kind: "simulation",
        success: result.success,
        error: result.error,
        logs: result.logs,
        actions: result.actions,
      });
    },
  });

  const listModules = tool({
    description:
      "List all EVML modules with a one-line overview of each. Modules other than std must be loaded with `load <module>` before their commands and helpers can be used.",
    inputSchema: z.object({}),
    execute: async () => {
      const lines = await Promise.all(
        MODULES.map(
          async (name) => `${name} — ${(await getModuleOverview(name)) ?? ""}`,
        ),
      );
      return lines.join("\n");
    },
  });

  const describeModule = tool({
    description:
      "Get a module's README: what it does plus a table of all its commands and helpers with one-line descriptions. Use get_docs for the full documentation of a specific command or helper.",
    inputSchema: z.object({
      module: z.string().describe(`Module name, one of: ${MODULES.join(", ")}`),
    }),
    execute: async ({ module }) => {
      const docs = await loadModuleDocs(module);
      if (!docs)
        return `ERROR: Unknown module "${module}". Available modules: ${MODULES.join(", ")}.`;
      return docs;
    },
  });

  const getDocs = tool({
    description:
      "Get the full documentation of an EVML command or helper: syntax, arguments, options, and examples. Use describe_module to discover available names. Look up syntax you are not sure about instead of guessing.",
    inputSchema: z.object({
      module: z
        .string()
        .describe(
          `Module the command/helper belongs to, one of: ${MODULES.join(", ")}`,
        ),
      name: z
        .string()
        .describe(
          "Command or helper name, e.g. 'exec', 'token.balance'. Module prefix and '@' are optional.",
        ),
      kind: z
        .enum(["command", "helper"])
        .optional()
        .describe("Restrict lookup to commands or helpers"),
    }),
    execute: async ({ module, name, kind }) => {
      const bare = name.replace(new RegExp(`^@?(${module}:)?`), "");

      let docs: string | null = null;
      if (kind !== "helper") docs = await loadCommandDocs(module, bare);
      if (!docs && kind !== "command")
        docs = await loadHelperDocs(module, bare);

      if (!docs)
        return `ERROR: No ${kind ?? "command or helper"} named "${bare}" found in module "${module}". Call describe_module with module "${module}" to list available commands and helpers.`;
      return docs;
    },
  });

  return {
    get_script: getScript,
    edit_script: editScript,
    write_script: writeScript,
    set_script_title: setScriptTitle,
    validate_script: validateScript,
    simulate_script: simulateScript,
    list_modules: listModules,
    describe_module: describeModule,
    get_docs: getDocs,
    ...createContractTools(),
    ...createWebTools(),
  };
}
