import { encodePacked, getContractAddress, keccak256, parseAbi } from "viem";

import { ErrorException } from "../../../errors";
import type { Action, Address } from "../../../types";
import { BindingsSpace } from "../../../types";
import { defineCommand, encodeAction } from "../../../utils";
import type { AragonOS } from "..";
import { _aragonEns } from "../helpers/aragonEns";
import {
  ARAGON_REGISTRARS,
  buildNonceForAddress,
  DAO_FACTORIES,
} from "../utils";

const registerAragonId = async (
  module: AragonOS,
  name: string,
  owner: string,
): Promise<Action[]> => {
  const chainId = await module.getChainId();

  if (!ARAGON_REGISTRARS.has(chainId)) {
    throw new ErrorException(
      `no Aragon registrar was found on chain ${chainId}`,
    );
  }

  return [
    encodeAction(
      ARAGON_REGISTRARS.get(chainId)!,
      "register(bytes32 _subnode, address _owner)",
      [keccak256(encodePacked(["string"], [name])), owner],
    ),
  ];
};

export default defineCommand<AragonOS>({
  name: "new-dao",
  args: [
    {
      name: "daoName",
      type: "string",
      interpretOptions: { treatAsLiteral: true },
    },
  ],
  async run(module, { daoName }) {
    const provider = await module.getClient();

    const bareTemplateRepoAddr: Address = (await _aragonEns(
      `bare-template.aragonpm.eth`,
      provider,
      module.getConfigBinding("ensResolver"),
    ))!;

    const client = await module.getClient();

    const bareTemplateAddr = (
      await client.readContract({
        abi: parseAbi([
          "function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)",
        ]),
        address: bareTemplateRepoAddr,
        functionName: "getLatest",
      })
    )[1];

    const daoFactory = DAO_FACTORIES.get(await module.getChainId());
    if (!daoFactory) {
      throw new ErrorException("network not supported");
    }
    const nonce = await buildNonceForAddress(
      daoFactory,
      await module.incrementNonce(daoFactory),
      provider,
    );
    const newDaoAddress = getContractAddress({ from: daoFactory, nonce });

    module.bindingsManager.setBinding(
      `_${daoName}`,
      newDaoAddress,
      BindingsSpace.ADDR,
    );

    let registerAragonIdActions: Action[] = [];

    registerAragonIdActions = await registerAragonId(
      module,
      daoName,
      newDaoAddress,
    );

    return [
      encodeAction(bareTemplateAddr!, "newInstance()", []),
      ...registerAragonIdActions,
    ];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
});
