import {
  commands as aragonosCommands,
  helpers as aragonosHelpers,
} from "../../../../modules/aragonos/src/_generated";
import {
  commands as ensCommands,
  helpers as ensHelpers,
} from "../../../../modules/ens/src/_generated";
import {
  commands as givethCommands,
  helpers as givethHelpers,
} from "../../../../modules/giveth/src/_generated";
import { helpers as httpHelpers } from "../../../../modules/http/src/_generated";
import { commands as simCommands } from "../../../../modules/sim/src/_generated";
import {
  commands as stdCommands,
  helpers as stdHelpers,
} from "../../../../modules/std/src/_generated";

export type ReferenceEntry = {
  name: string;
  kind: "command" | "helper";
  module: string;
  description: string;
  returnType?: string;
  argDefs?: Array<{
    name: string;
    type: string;
    optional?: boolean;
    rest?: boolean;
  }>;
  loadDocs: () => Promise<string>;
};

type ModuleDef = {
  name: string;
  commands: Record<string, { description?: string }>;
  helpers: Record<
    string,
    {
      description?: string;
      returnType?: string | string[];
      argDefs?: Array<{
        name: string;
        type: string | string[];
        optional?: boolean;
        rest?: boolean;
      }>;
    }
  >;
};

const modules: ModuleDef[] = [
  { name: "std", commands: stdCommands, helpers: stdHelpers },
  { name: "aragonos", commands: aragonosCommands, helpers: aragonosHelpers },
  { name: "sim", commands: simCommands, helpers: {} },
  { name: "http", commands: {}, helpers: httpHelpers },
  { name: "ens", commands: ensCommands, helpers: ensHelpers },
  { name: "giveth", commands: givethCommands, helpers: givethHelpers },
];

// Map of module name -> doc import function for commands and helpers
const docImports: Record<
  string,
  (name: string, kind: "command" | "helper") => Promise<string>
> = {
  std: (name, kind) =>
    import(
      `../../../../modules/std/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  aragonos: (name, kind) =>
    import(
      `../../../../modules/aragonos/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  sim: (name, kind) =>
    import(
      `../../../../modules/sim/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  http: (name, kind) =>
    import(
      `../../../../modules/http/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  ens: (name, kind) =>
    import(
      `../../../../modules/ens/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  giveth: (name, kind) =>
    import(
      `../../../../modules/giveth/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
};

export const referenceEntries: ReferenceEntry[] = modules.flatMap(
  ({ name: moduleName, commands, helpers }) => {
    const cmdEntries: ReferenceEntry[] = Object.entries(commands).map(
      ([name, entry]) => ({
        name,
        kind: "command" as const,
        module: moduleName,
        description: entry.description ?? "",
        loadDocs: () => docImports[moduleName](name, "command").catch(() => ""),
      }),
    );

    const helperEntries: ReferenceEntry[] = Object.entries(helpers).map(
      ([name, entry]) => ({
        name,
        kind: "helper" as const,
        module: moduleName,
        description: entry.description ?? "",
        returnType: Array.isArray(entry.returnType)
          ? entry.returnType.join(" | ")
          : entry.returnType,
        argDefs: entry.argDefs?.map((a) => ({
          name: a.name,
          type: Array.isArray(a.type) ? a.type.join(" | ") : a.type,
          optional: a.optional,
          rest: a.rest,
        })),
        loadDocs: () => docImports[moduleName](name, "helper").catch(() => ""),
      }),
    );

    return [...cmdEntries, ...helperEntries];
  },
);

/** All unique module names, in display order. */
export const moduleNames = modules.map((m) => m.name);

/** Fast lookup sets for cursor detection. */
export const commandNames = new Set(
  referenceEntries.filter((e) => e.kind === "command").map((e) => e.name),
);
export const helperNames = new Set(
  referenceEntries.filter((e) => e.kind === "helper").map((e) => e.name),
);
