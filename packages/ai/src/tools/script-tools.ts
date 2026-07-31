import type { EvmlTag, SimulationResult } from "@evmcrispr/core";
import { type ToolSet, tool } from "ai";
import { z } from "zod";

export type ScriptEditResult =
  | { ok: true; revisionId?: string }
  | { ok: false; error: string };

/**
 * Adapter a host implements to let the chat agent read and edit "the
 * script" it is working on. Hosts decide what that means: the terminal app
 * routes edits through its Monaco undo stack, a simpler host can just hold
 * the script in React state.
 */
export interface ScriptToolsHost {
  /** Tag used to validate/simulate scripts (with the host's modules loaded). */
  tag: EvmlTag;
  /** Current script content. */
  getScript(): string;
  /** Current script title, if the host tracks one. */
  getTitle?(): string;
  /** Update the script title, if the host tracks one. */
  setTitle?(title: string): void;
  /** Apply an exact string replacement; `oldString` must match uniquely. */
  applyStrReplace(oldString: string, newString: string): ScriptEditResult;
  /** Replace the whole script. */
  applyWrite(content: string): ScriptEditResult;
  /**
   * Simulate a script on a fork. Hosts that run interpretation off the main
   * thread (e.g. a worker) can route through it here; a host without one can
   * call `tag.script(script).simulate(opts)` directly.
   */
  simulate(
    script: string,
    opts: { from?: string; blockNumber?: number },
  ): Promise<SimulationResult>;
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

async function validateCurrent(host: ScriptToolsHost) {
  const { diagnostics, valid } = await host.tag
    .script(host.getScript())
    .validate();
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
 * Tools the chat assistant can use to read, edit, validate and simulate the
 * host's script. Factory so a host-specific adapter (React state, an editor
 * store, ...) reaches non-React closures.
 */
export function createScriptTools(host: ScriptToolsHost): ToolSet {
  const getScript = tool({
    description:
      "Read the current EVML script. Returns the script title (if any) and the content with line numbers (tab-separated). Always read the script before editing it.",
    inputSchema: z.object({}),
    execute: async () =>
      `Title: ${host.getTitle?.() || "(untitled)"}\n\n${numbered(host.getScript())}`,
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
      const res = host.applyStrReplace(old_string, new_string);
      if (!res.ok) {
        return { kind: "script-change", ok: false, error: res.error };
      }
      return {
        kind: "script-change",
        ok: true,
        operation: "edit",
        revisionId: res.revisionId,
        validation: await validateCurrent(host),
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
      const res = host.applyWrite(content);
      if (!res.ok) {
        return { kind: "script-change", ok: false, error: res.error };
      }
      return {
        kind: "script-change",
        ok: true,
        operation: "write",
        revisionId: res.revisionId,
        validation: await validateCurrent(host),
      };
    },
  });

  const validateScript = tool({
    description:
      "Validate the current script (syntax and static semantics). Runs offline; sends no transactions.",
    inputSchema: z.object({}),
    execute: async () => ({
      kind: "validation",
      ...(await validateCurrent(host)),
    }),
  });

  const simulateScript = tool({
    description:
      "Simulate an EVML script on a chain fork: the current script, or `script` if given. Returns a success flag, per-action logs, and the resolved actions. `print` output appears in the logs, so a throwaway `print` script doubles as an on-chain read (balances, ENS names, any helper value). Slow (can take several seconds); nothing is broadcast on-chain.",
    inputSchema: z.object({
      script: z
        .string()
        .optional()
        .describe(
          "Script to simulate instead of the current one (e.g. a `print` one-liner to read on-chain values)",
        ),
      from: z
        .string()
        .optional()
        .describe(
          "Address to simulate from (defaults to the host's connected account, if any)",
        ),
      blockNumber: z.number().optional().describe("Fork at this block number"),
    }),
    execute: async ({ script, from, blockNumber }) => {
      const result = await host.simulate(script ?? host.getScript(), {
        from,
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

  const tools: ToolSet = {
    get_script: getScript,
    edit_script: editScript,
    write_script: writeScript,
    validate_script: validateScript,
    simulate_script: simulateScript,
  };

  if (host.setTitle) {
    tools.set_script_title = tool({
      description:
        "Set the script title. Use it whenever the script is untitled or the current title no longer reflects what the script does. Titles should be a few words describing the script's overall purpose — broad enough that small edits to the script don't require renaming it.",
      inputSchema: z.object({
        title: z.string().describe("New script title (a few words)"),
      }),
      execute: async ({ title }) => {
        host.setTitle?.(title.trim());
        return { kind: "title-change", ok: true, title: title.trim() };
      },
    });
  }

  return tools;
}
