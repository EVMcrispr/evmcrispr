import {
  chainLabel,
  defineHelper,
  ErrorException,
  type Node,
  resolveChainId,
} from "@evmcrispr/sdk";
import {
  CORE_ADDRESS,
  compileOperand,
  encodeResolve,
  type Operand,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import type Eez from "..";
import {
  computeProxy,
  eezConfig,
  isDeployed,
  resolveRollup,
} from "../utils/eez";

export default defineHelper<Eez>({
  name: "on",
  batchable: false,
  description:
    "Evaluate an expression as if the script were on another chain, and return its value: helpers, `::` calls, variables and arithmetic resolve against that chain (reads only).",
  compileDescription:
    "Reads the other chain through the proxy of its Assertions core, so the assertion runs as a transaction; one hop only, not simulable.",
  returnType: "any",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "Chain to evaluate on (`eezL2`, a viem name or a chain id)",
    },
    {
      name: "expression",
      type: "any",
      lazy: true,
      description:
        "Expression evaluated as if the script had switched to that chain",
    },
  ],
  async run(module, { chain, expression }, { interpreters }) {
    const node = expression as Node | undefined;
    if (!node) {
      throw new ErrorException(
        "@eez:on expects a chain and an expression, e.g. @eez:on(6290 @balance(ETH @me))",
      );
    }
    const target = resolveChainId(chain);
    const current = await module.getChainId();
    if (target === current) return interpreters.interpretNode(node);

    const previous = await module.getClient();
    try {
      module.switchChainId(target);
    } catch {
      throw new ErrorException(
        `${chainLabel(target)} is not configured — no RPC is known for it in this environment`,
      );
    }
    try {
      return await interpreters.interpretNode(node);
    } finally {
      // Restore the exact previous client (not a rebuilt one): inside a
      // simulation that keeps the fork the script was running against.
      module.context.setClient(previous);
    }
  },
  compile: async (ctx, node) => {
    const [chainNode, exprNode] = node.args;
    if (!chainNode || !exprNode) {
      throw new ErrorException(
        "@eez:on! expects a chain and an expression, e.g. @eez:on!(eezL2 @balance!(ETH @me))",
      );
    }
    const module = ctx.module as Eez;
    const target = resolveChainId(
      await ctx.interpreters.interpretNode(chainNode),
    );
    const current = await module.getChainId();
    if (target === current) return compileOperand(ctx, exprNode);

    // The read goes out through this chain's proxy of the core over there;
    // core and operators sit at the same canonical addresses on every
    // chain, so the compiled calldata needs no translation.
    const config = await eezConfig(module);
    const rollupId = resolveRollup(config, target);
    const proxy = await computeProxy(module, config, CORE_ADDRESS, rollupId);
    if (!(await isDeployed(module, proxy))) {
      throw new ErrorException(
        `the proxy on ${chainLabel(current)} of the Assertions core on ${chainLabel(target)} has not been created yet — run \`eez:deploy-proxy ${CORE_ADDRESS} --chain ${target}\` first`,
      );
    }

    const previous = await module.getClient();
    try {
      module.switchChainId(target);
    } catch {
      throw new ErrorException(
        `${chainLabel(target)} is not configured — no RPC is known for it in this environment`,
      );
    }
    let inner: Operand;
    try {
      inner = await compileOperand(ctx, exprNode);
    } finally {
      module.context.setClient(previous);
    }
    if (inner.kind === "const") return inner;

    // `resolve(param)` on the far core raw-returns the resolved bytes, and
    // a STATICCALL to the proxy returns them inline: the same bytes the
    // inner operand would have produced, so the category carries over.
    if (ctx.hints) ctx.hints.transact = true;
    return {
      kind: "call",
      cat: inner.cat,
      scale: inner.scale,
      param: staticCallParam(proxy, encodeResolve(inner.param)),
    };
  },
});
