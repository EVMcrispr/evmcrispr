import type {
  Action,
  AST,
  CommandExpressionNode,
  Module,
  Node,
  NodesInterpreters,
} from "@evmcrispr/sdk";
import { ErrorException, ExitSignal, NodeType } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { actionsToCalls, type RunnerCall } from "../runner/calls";
import { RUNNER_EXCLUDED_MODULES } from "../runner/schema";
import { asExecutor } from "./executor";

const excluded = new Set<string>(RUNNER_EXCLUDED_MODULES);

function loadedModuleName(node: Node): string | undefined {
  if (node.type !== NodeType.CommandExpression) return undefined;
  const cmd = node as CommandExpressionNode;
  if (cmd.name !== "load" || (cmd.module && cmd.module !== "std")) {
    return undefined;
  }
  const first = cmd.args[0] as { value?: unknown } | undefined;
  return typeof first?.value === "string" ? first.value : undefined;
}

/**
 * Parse a script a task will run through the EVML runner and refuse the
 * modules the runner does not ship, before the task is created.
 */
export function parseScheduledScript(module: Module, source: string): AST {
  const { ast, errors } = module.context.parseEvml(source);
  if (errors.length) {
    throw new ErrorException(
      `the scheduled script does not parse: ${errors[0]}`,
    );
  }
  for (const node of ast.body) {
    const name = loadedModuleName(node)?.split(">")[0];
    if (name && excluded.has(name)) {
      throw new ExceptionExcludedModule(name);
    }
  }
  return ast;
}

class ExceptionExcludedModule extends ErrorException {
  constructor(name: string) {
    super(
      `load ${name} is not available in a scheduled script: the runner ships every module except ${RUNNER_EXCLUDED_MODULES.join(", ")}`,
    );
  }
}

/**
 * Interpret a scheduled script here, the way the runner will: with
 * `executor` (the dedicated msg.sender) as `@sender`, collecting the calls
 * it produces.
 * Runs inside the enclosing script, so modules that script already loaded
 * are shared: their bare `load` lines are skipped rather than failing as
 * duplicates. An `exit` ends the script cleanly, as it does in the runner.
 */
export async function interpretScheduled(
  module: Module,
  interpreters: NodesInterpreters,
  source: string,
  executor: Address,
): Promise<RunnerCall[]> {
  const ast = parseScheduledScript(module, source);
  const loaded = new Set(module.context.modules.map((m) => m.name));
  const nodes = ast.body.filter((node) => {
    const name = loadedModuleName(node);
    if (name === undefined || !loaded.has(name)) return true;
    const cmd = node as CommandExpressionNode;
    if (cmd.args.length > 1 || cmd.opts.length > 0) {
      throw new ErrorException(
        `load ${name} inside the scheduled script cannot take an import list or --from here: the enclosing script already loaded ${name}`,
      );
    }
    return false;
  });
  const actions: Action[] = [];
  await asExecutor(module, executor, async () => {
    try {
      await interpreters.interpretNodes(nodes, true, {
        actionCallback: async (action) => {
          actions.push(action);
        },
      });
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
    }
  });
  return actionsToCalls(actions, executor);
}
