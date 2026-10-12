import type { Action, BlockExpressionNode, WalletAction } from "@evmcrispr/sdk";
import {
  ControlFlowSignal,
  defineCommand,
  ErrorException,
  truncateAddress,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Std from "..";
import { resolveChainId } from "../argTypes";

const switchTo = (chainId: number): WalletAction => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId: `0x${chainId.toString(16)}` }],
});

export default defineCommand<Std>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "switch",
  description:
    "Change the acting context: the chain, the account (--as), or both. With a block, for that block; without one, until the end of the block it is written in.",
  batchable: false,
  args: [
    {
      name: "networkNameOrId",
      type: "chain",
      optional: true,
      description:
        "Chain name in camelCase as exported by viem (e.g. `mainnet`, `gnosis`, `baseSepolia`, `polygonZkEvm`) or numeric chain ID",
    },
    {
      name: "block",
      type: "block",
      optional: true,
      description:
        "Commands to run on that chain and as that account; both are put back when the block ends. Without it, the change lasts until the end of the enclosing block, or of the script at the top level.",
    },
  ],
  opts: [
    {
      name: "as",
      type: "address",
      description:
        "Account the steps are run by: what `@me` resolves to. A simulation impersonates it; a real run only accepts the connected account.",
    },
  ],
  async run(module, { networkNameOrId, block }, { opts, interpreters }) {
    const as = opts.as as Address | undefined;
    const hasChain = networkNameOrId !== undefined;

    if (!hasChain && as === undefined) {
      throw new ErrorException("switch needs a chain, --as <address>, or both");
    }
    const chainId = hasChain ? resolveChainId(networkNameOrId) : undefined;
    const previousAccount = await module
      .getConnectedAccount()
      .catch(() => undefined);

    // Outside a simulation nobody but the connected wallet can act: the
    // hand-off to another signer is not something a run can do yet.
    if (
      as &&
      !interpreters.simulation &&
      previousAccount &&
      previousAccount.toLowerCase() !== as.toLowerCase()
    ) {
      throw new ErrorException(
        `switch --as ${truncateAddress(as)}: the connected account is ${truncateAddress(previousAccount)}. Connect ${truncateAddress(as)} to run these steps, or simulate the script.`,
      );
    }

    if (!block) {
      if (as) module.context.setConnectedAccount(as);
      if (chainId === undefined) return [];
      module.switchChainId(chainId);
      return [switchTo(chainId)];
    }

    // The block scopes the change: whatever interprets a block puts the
    // chain and the account back when it ends, and moves the host back.
    // So the block form is the bare form applied as the block opens.
    const enter = chainId === undefined ? [] : [switchTo(chainId)];
    try {
      const inner = (await interpreters.interpretNode(
        block as BlockExpressionNode,
        {
          actionCallback: interpreters.actionCallback,
          blockInitializer: async () => {
            if (as) module.context.setConnectedAccount(as);
            if (chainId !== undefined) module.switchChainId(chainId);
            // The host must be on the chain before the block's own actions.
            await interpreters.dispatch?.(enter);
          },
        },
      )) as Action[];
      return [...enter, ...inner];
    } catch (err) {
      if (err instanceof ControlFlowSignal) {
        err.actions = [...enter, ...err.actions];
      }
      throw err;
    }
  },
});
