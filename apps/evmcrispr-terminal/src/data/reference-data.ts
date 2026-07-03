import {
  commands as accessControlCommands,
  helpers as accessControlHelpers,
} from "../../../../modules/access-control/src/_generated";
import {
  commands as aragonosCommands,
  helpers as aragonosHelpers,
} from "../../../../modules/aragonos/src/_generated";
import {
  commands as assertionsCommands,
  helpers as assertionsHelpers,
} from "../../../../modules/assertions/src/_generated";
import {
  commands as ensCommands,
  helpers as ensHelpers,
} from "../../../../modules/ens/src/_generated";
import {
  commands as givethCommands,
  helpers as givethHelpers,
} from "../../../../modules/giveth/src/_generated";
import {
  commands as governorCommands,
  helpers as governorHelpers,
} from "../../../../modules/governor/src/_generated";
import { helpers as httpHelpers } from "../../../../modules/http/src/_generated";
import {
  commands as proxiesCommands,
  helpers as proxiesHelpers,
} from "../../../../modules/proxies/src/_generated";
import {
  commands as safeCommands,
  helpers as safeHelpers,
} from "../../../../modules/safe/src/_generated";
import { commands as simCommands } from "../../../../modules/sim/src/_generated";
import {
  commands as stdCommands,
  helpers as stdHelpers,
} from "../../../../modules/std/src/_generated";
import { commands as tokenCommands } from "../../../../modules/token/src/_generated";

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
  { name: "token", commands: tokenCommands, helpers: {} },
  {
    name: "access-control",
    commands: accessControlCommands,
    helpers: accessControlHelpers,
  },
  { name: "governor", commands: governorCommands, helpers: governorHelpers },
  { name: "proxies", commands: proxiesCommands, helpers: proxiesHelpers },
  { name: "safe", commands: safeCommands, helpers: safeHelpers },
  { name: "giveth", commands: givethCommands, helpers: givethHelpers },
  {
    name: "assertions",
    commands: assertionsCommands,
    helpers: assertionsHelpers,
  },
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
  token: (name, kind) =>
    import(
      `../../../../modules/token/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  "access-control": (name, kind) =>
    import(
      `../../../../modules/access-control/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  governor: (name, kind) =>
    import(
      `../../../../modules/governor/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  proxies: (name, kind) =>
    import(
      `../../../../modules/proxies/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  safe: (name, kind) =>
    import(
      `../../../../modules/safe/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  giveth: (name, kind) =>
    import(
      `../../../../modules/giveth/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
    ).then((m) => m.default),
  assertions: (name, kind) =>
    import(
      `../../../../modules/assertions/src/${kind === "command" ? "commands" : "helpers"}/${name}.md?raw`
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
