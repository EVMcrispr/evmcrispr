import { type ToolSet, tool } from "ai";
import { z } from "zod";

import {
  getModuleOverview,
  loadCommandDocs,
  loadHelperDocs,
  loadModuleDocs,
  MODULES,
} from "./docs";

/** Tools that expose the generated EVML module/command/helper reference. */
export function createDocTools(): ToolSet {
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
    list_modules: listModules,
    describe_module: describeModule,
    get_docs: getDocs,
  };
}
