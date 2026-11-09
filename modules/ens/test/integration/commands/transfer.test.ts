import "../../setup";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  labelhash,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";

describeCommand("transfer", {
  describeName: "Ens > commands > transfer <name> to <newOwner>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        "ens:transfer mydao.eth to 0x1234567890abcdef1234567890abcdef12345678",
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:transfer mydao.eth",
      error: "invalid number of arguments",
    },
  ],
});

// An ENSv2 name registered on mainnet, with years left. Its owner and token
// id are read live, never pinned: the name can change hands, and the token
// id changes whenever its roles do.
const V2_LABEL = "opensystem";
const ETH_REGISTRY = getAddress("0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2");
const NEW_OWNER = "0x1111111111111111111111111111111111111111";
const registryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: getTransports()[mainnet.id],
});
const v2State = () =>
  mainnetClient.readContract({
    address: ETH_REGISTRY,
    abi: registryAbi,
    functionName: "getState",
    args: [BigInt(labelhash(V2_LABEL))],
  });
const { latestOwner: v2Owner } = await v2State();

describeCommand("transfer", {
  describeName: "Ens > commands > transfer an ENSv2 name",
  module: "ens",
  chainId: mainnet.id,
  preamble: "load ens",
  cases: [
    {
      name: "moves the name's registry token, with its roles, from its owner",
      script: `ens:transfer ${V2_LABEL}.eth to ${NEW_OWNER}`,
      validate: async (actions) => {
        const state = await v2State();
        expect(state.status).to.equal(2); // REGISTERED
        expect(actions).to.have.length(1);
        const [action] = actions as { to: string; data: `0x${string}` }[];
        expect(getAddress(action.to)).to.equal(ETH_REGISTRY);
        const { functionName, args } = decodeFunctionData({
          abi: registryAbi,
          data: action.data,
        });
        expect(functionName).to.equal("safeTransferFrom");
        expect(args).to.deep.equal([
          state.latestOwner,
          getAddress(NEW_OWNER),
          state.tokenId,
          1n,
          "0x",
        ]);
      },
    },
  ],
  errorCases: [
    {
      name: "refuses a transfer to the current owner: there is no controller to reclaim",
      script: `ens:transfer ${V2_LABEL}.eth to ${v2Owner}`,
      error: "has no separate controller to reclaim",
    },
  ],
});
