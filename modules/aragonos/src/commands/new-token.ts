import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
} from "@evmcrispr/sdk";
import { getContractAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import { buildNonceForAddress, MINIME_TOKEN_FACTORIES } from "../utils";

export default defineCommand<AragonOS>({
  name: "new-token",
  description:
    "Create a new MiniMe token with configurable name, symbol, and decimals.",
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    { name: "name", type: "string", description: "Token name" },
    { name: "symbol", type: "string", description: "Token symbol" },
    { name: "controller", type: "address", description: "Token controller address" },
    { name: "decimals", type: "number", description: "Decimal places", optional: true },
    { name: "transferable", type: "bool", description: "Whether the token is transferable", optional: true },
  ],
  async run(
    module,
    { variable, name, symbol, controller, decimals = 18, transferable = true },
  ) {
    const chainId = await module.getChainId();

    if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
      throw new ErrorException(
        `no MiniMeTokenFactory was found on chain ${chainId}`,
      );
    }

    const factoryAddr = MINIME_TOKEN_FACTORIES.get(chainId)!;
    const nonce = await buildNonceForAddress(
      factoryAddr,
      await module.incrementNonce(factoryAddr),
      await module.getClient(),
    );
    const newTokenAddress = getContractAddress({
      from: factoryAddr,
      nonce,
    });

    module.bindingsManager.setBinding(
      variable,
      newTokenAddress,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    return [
      encodeAction(
        factoryAddr,
        "createCloneToken(address,uint,string,uint8,string,bool)",
        [zeroAddress, 0, name, decimals, symbol, transferable],
      ),
      encodeAction(newTokenAddress, "changeController(address)", [controller]),
    ];
  },
});
