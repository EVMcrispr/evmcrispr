import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData, stringToHex } from "viem";
import { DAO_ABI } from "../../../src/abis";
import { ADMIN_ABI } from "../../../src/plugins/admin";
import { MULTISIG_ABI } from "../../../src/plugins/multisig";
import { SPP_ABI } from "../../../src/plugins/spp";
import { TOKEN_VOTING_ABI } from "../../../src/plugins/token-voting";
import { permissionId } from "../../../src/utils/permissions";
import {
  ADMIN_PLUGIN,
  DAO_ADDRESS,
  MULTISIG_PLUGIN,
  PREAMBLE,
  SPP_PLUGIN,
  TOKEN_VOTING_PLUGIN,
} from "../../fixtures";

/** The proposal payload used in every case: grant EXECUTE on the DAO. */
const INNER_SCRIPT = `aragonosx:grant ${TEST_ACCOUNT_ADDRESS} dao EXECUTE`;
const INNER_ACTIONS = [
  {
    to: DAO_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: DAO_ABI,
      functionName: "grant",
      args: [DAO_ADDRESS, TEST_ACCOUNT_ADDRESS, permissionId("EXECUTE")],
    }),
  },
];

describeCommand("propose", {
  module: "aragonosx",
  preamble: `${PREAMBLE}\naragonosx:connect ${DAO_ADDRESS} (`,
  cases: [
    {
      name: "creates an immediate proposal on the admin plugin",
      script: `aragonosx:propose admin --metadata "ipfs://QmTest" (
  ${INNER_SCRIPT}
)
)`,
      expectedActions: [
        {
          to: ADMIN_PLUGIN,
          data: encodeFunctionData({
            abi: ADMIN_ABI,
            functionName: "executeProposal",
            args: [stringToHex("ipfs://QmTest"), INNER_ACTIONS, 0n],
          }),
        },
      ],
    },
    {
      name: "creates a multisig proposal with approval and execution window",
      script: `aragonosx:propose multisig --approve true --try-execution true --end 1893456000 (
  ${INNER_SCRIPT}
)
)`,
      expectedActions: [
        {
          to: MULTISIG_PLUGIN,
          data: encodeFunctionData({
            abi: MULTISIG_ABI,
            functionName: "createProposal",
            args: ["0x", INNER_ACTIONS, 0n, true, true, 0n, 1893456000n],
          }),
        },
      ],
    },
    {
      name: "creates a token-voting proposal voting yes on creation",
      script: `aragonosx:propose token-voting --vote yes (
  ${INNER_SCRIPT}
)
)`,
      expectedActions: [
        {
          to: TOKEN_VOTING_PLUGIN,
          data: encodeFunctionData({
            abi: TOKEN_VOTING_ABI,
            functionName: "createProposal",
            args: ["0x", INNER_ACTIONS, 0n, 0n, 0n, 2, false],
          }),
        },
      ],
    },
    {
      name: "creates a staged proposal with empty stage params",
      script: `aragonosx:propose staged-proposal-processor (
  ${INNER_SCRIPT}
)
)`,
      expectedActions: [
        {
          to: SPP_PLUGIN,
          data: encodeFunctionData({
            abi: SPP_ABI,
            functionName: "createProposal",
            args: ["0x", INNER_ACTIONS, 0n, 0n, []],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "rejects --vote on a multisig plugin",
      script: `aragonosx:propose multisig --vote yes (
  ${INNER_SCRIPT}
)
)`,
      error: "use --approve instead of --vote",
    },
    {
      name: "rejects an invalid --vote option",
      script: `aragonosx:propose token-voting --vote maybe (
  ${INNER_SCRIPT}
)
)`,
      error: "invalid --vote value",
    },
    {
      name: "rejects --start on the admin plugin",
      script: `aragonosx:propose admin --start 1893456000 (
  ${INNER_SCRIPT}
)
)`,
      error: "executes proposals immediately",
    },
  ],
  docCases: [
    {
      description:
        "Propose a treasury transfer through the token-voting plugin, voting yes on creation",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting --metadata "ipfs://QmMetadata" --vote yes (
    exec 0x6B175474E89094C44Da98b954EedeAC495271d0F transfer(address,uint256) 0xc125218F4Df091eE40624784caF7F47B9738086f 100e18
  )
)`,
    },
  ],
});
