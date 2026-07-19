import type {
  AST,
  BlockExpressionNode,
  CommandExpressionNode,
  DefValue,
  Module,
  NodesInterpreters,
} from "@evmcrispr/sdk";
import {
  BindingsSpace,
  ErrorException,
  EvmlModule,
  NodeType,
  resolveModuleSource,
} from "@evmcrispr/sdk";

const MODULE_NAME_RE = /^[a-zA-Z][a-zA-Z-]{0,62}$/;

/** Validate an EVML module name / load alias: charset, the reserved `std`
 *  prelude, and actual double-binding. Registered-but-unloaded names are
 *  deliberately allowed (local definitions shadow the registry) so scripts
 *  published today keep working when future built-in modules take the same
 *  name. */
export function checkEvmlModuleName(module: Module, name: string): void {
  if (!MODULE_NAME_RE.test(name) || name.endsWith("-")) {
    throw new ErrorException(
      `invalid module name "${name}" — use letters and dashes, starting with a letter`,
    );
  }
  if (name === "std") {
    throw new ErrorException(`module name "std" is reserved`);
  }
  if (module.context.modules.some((m) => m.name === name)) {
    throw new ErrorException(`module ${name} already loaded`);
  }
}

/**
 * Build an EvmlModule from a `module <name> ( ... )` block: validate the
 * block contains only `def` commands, interpret them in a throwaway scope
 * (def binds scope-locally), collect the resulting DefValues and wrap them
 * into a module instance named `alias`.
 */
export async function buildEvmlModule(
  module: Module,
  blockNode: BlockExpressionNode,
  alias: string,
  canonicalName: string,
  interpreters: NodesInterpreters,
): Promise<EvmlModule> {
  for (const node of blockNode.body) {
    if (node.name !== "def" || (node.module && node.module !== "std")) {
      throw new ErrorException(
        `module blocks may only contain def commands (found "${commandLabel(node)}")`,
      );
    }
    if (
      node.args[0]?.type === NodeType.Bareword &&
      node.args[0].value === "module"
    ) {
      throw new ErrorException(
        `nested module definitions are not allowed (in module ${canonicalName})`,
      );
    }
  }

  const bm = module.bindingsManager;
  const defs = new Map<string, DefValue>();
  bm.enterScope();
  try {
    for (const defNode of blockNode.body) {
      try {
        await interpreters.interpretNode(defNode);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("already exists")) {
          throw new ErrorException(
            `duplicate def name in module ${canonicalName}`,
          );
        }
        throw err;
      }
    }
    for (const binding of bm.getAllBindings({
      onlyLocal: true,
      spaceFilters: [BindingsSpace.DEF],
    })) {
      defs.set(binding.identifier, binding.value as DefValue);
    }
  } finally {
    bm.exitScope();
  }

  return new EvmlModule(alias, canonicalName, defs, module.context);
}

/** Register a built EVML module for execution: publish its metadata to the
 *  MODULE space (mirroring `load`) and add it to the loaded-modules list. */
export function registerEvmlModule(module: Module, instance: EvmlModule): void {
  module.bindingsManager.setBinding(
    instance.name,
    instance.toModuleData(),
    BindingsSpace.MODULE,
    true,
  );
  module.context.modules.push(instance);
}

function commandLabel(node: CommandExpressionNode): string {
  return node.module ? `${node.module}:${node.name}` : node.name;
}

const IPFS_FROM_RE = /^ipfs:\/\/([a-zA-Z0-9]+)(?:#([A-Za-z0-9_-]+))?$/;

/** Whether a command node is a `def module <name> ( ... )` definition. */
export function isModuleDefNode(node: CommandExpressionNode): boolean {
  return (
    node.name === "def" &&
    (!node.module || node.module === "std") &&
    node.args[0]?.type === NodeType.Bareword &&
    node.args[0].value === "module"
  );
}

/**
 * Load an external EVML module file: fetch the CID's plain text, parse it,
 * require exactly one `def module <name> ( ... )` command whose name matches
 * `canonical` (the name written in the load line), and build the module
 * under `alias` (the `>` rename, or the canonical name itself).
 */
export async function loadExternalEvmlModule(
  module: Module,
  canonical: string,
  alias: string,
  from: string,
  interpreters: NodesInterpreters,
): Promise<EvmlModule> {
  checkEvmlModuleName(module, alias);

  const m = from.match(IPFS_FROM_RE);
  if (!m) {
    throw new ErrorException(
      `--from only supports ipfs://<cid> or ipfs://<cid>#<key> sources, got ${from}`,
    );
  }

  const raw = await module.ipfsResolver.text(m[1]);
  const source = await resolveModuleSource(raw, { decryptionKey: m[2] });

  let ast: AST;
  let errors: string[];
  try {
    ({ ast, errors } = module.context.parseEvml(source));
  } catch (err) {
    throw new ErrorException(
      `couldn't parse module file ${from}: ${(err as Error).message}`,
    );
  }
  if (errors.length) {
    throw new ErrorException(
      `module file ${from} has parse errors:\n${errors.join("\n")}`,
    );
  }

  const commands = ast.body.filter(
    (n): n is CommandExpressionNode => n?.type === NodeType.CommandExpression,
  );
  if (commands.length !== 1 || !isModuleDefNode(commands[0])) {
    throw new ErrorException(
      `module file ${from} must contain exactly one def module command`,
    );
  }

  const moduleNode = commands[0];
  const nameArg = moduleNode.args[1];
  const declaredName =
    nameArg?.type === NodeType.Bareword ? String(nameArg.value) : undefined;
  if (!declaredName) {
    throw new ErrorException(
      `module file ${from}: the def module command needs a name`,
    );
  }
  if (declaredName !== canonical) {
    throw new ErrorException(
      `module file ${from} declares module "${declaredName}", not "${canonical}" — load it as \`load ${declaredName} --from ...\` (optionally with a >rename)`,
    );
  }
  const blockNode = moduleNode.args.find(
    (a) => a.type === NodeType.BlockExpression,
  ) as BlockExpressionNode | undefined;
  if (!blockNode) {
    throw new ErrorException(
      `module file ${from}: the def module command needs a block body`,
    );
  }

  return buildEvmlModule(module, blockNode, alias, declaredName, interpreters);
}
