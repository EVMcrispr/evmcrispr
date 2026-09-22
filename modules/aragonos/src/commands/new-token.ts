import {
  BindingsSpace,
  chainLabel,
  defineCommand,
  ErrorException,
  encodeAction,
} from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type AragonOS from "..";
import { MINIME_TOKEN_FACTORIES } from "../utils";

export default defineCommand<AragonOS>({
  smartSupport: { kind: "runtime" },
  name: "new-token",
  primaryCall: 0,
  description:
    "Create a new MiniMe token with configurable name, symbol, and decimals.",
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    { name: "name", type: "string", runtime: true, description: "Token name" },
    {
      name: "symbol",
      type: "string",
      runtime: true,
      description: "Token symbol",
    },
    {
      name: "controller",
      type: "address",
      runtime: true,
      description: "Token controller address",
    },
    {
      name: "decimals",
      type: "number",
      runtime: true,
      description: "Decimal places",
      optional: true,
    },
    {
      name: "transferable",
      type: "bool",
      runtime: true,
      description: "Whether the token is transferable",
      optional: true,
    },
  ],
  async run(
    module,
    { variable, name, symbol, controller, decimals = 18, transferable = true },
  ) {
    const chainId = await module.getChainId();

    if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
      throw new ErrorException(
        `no MiniMeTokenFactory was found on ${chainLabel(chainId)}`,
      );
    }

    const factoryAddr = MINIME_TOKEN_FACTORIES.get(chainId)!;
    const newTokenAddress = await module.reserveNextAddress(factoryAddr);

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
        "createCloneToken(address,uint,string,uint8,string,bool) returns (address)",
        [zeroAddress, 0, name, decimals, symbol, transferable],
      ),
      encodeAction(newTokenAddress, "changeController(address)", [controller]),
    ];
  },
});
