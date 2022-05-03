import { Contract } from 'ethers';
import { ethers } from 'hardhat';

const repoAbi = [
  {
    constant: true,
    inputs: [],
    name: 'hasInitialized',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_script',
        type: 'bytes',
      },
    ],
    name: 'getEVMScriptExecutor',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getRecoveryVault',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
    name: 'allowRecoverability',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'appId',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getInitializationBlock',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_token',
        type: 'address',
      },
    ],
    name: 'transferToVault',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_sender',
        type: 'address',
      },
      {
        name: '_role',
        type: 'bytes32',
      },
      {
        name: '_params',
        type: 'uint256[]',
      },
    ],
    name: 'canPerform',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getEVMScriptRegistry',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'CREATE_VERSION_ROLE',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'kernel',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'isPetrified',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        name: 'versionId',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'semanticVersion',
        type: 'uint16[3]',
      },
    ],
    name: 'NewVersion',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'executor',
        type: 'address',
      },
      {
        indexed: false,
        name: 'script',
        type: 'bytes',
      },
      {
        indexed: false,
        name: 'input',
        type: 'bytes',
      },
      {
        indexed: false,
        name: 'returnData',
        type: 'bytes',
      },
    ],
    name: 'ScriptResult',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'vault',
        type: 'address',
      },
      {
        indexed: true,
        name: 'token',
        type: 'address',
      },
      {
        indexed: false,
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'RecoverToVault',
    type: 'event',
  },
  {
    constant: false,
    inputs: [],
    name: 'initialize',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_newSemanticVersion',
        type: 'uint16[3]',
      },
      {
        name: '_contractAddress',
        type: 'address',
      },
      {
        name: '_contentURI',
        type: 'bytes',
      },
    ],
    name: 'newVersion',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getLatest',
    outputs: [
      {
        name: 'semanticVersion',
        type: 'uint16[3]',
      },
      {
        name: 'contractAddress',
        type: 'address',
      },
      {
        name: 'contentURI',
        type: 'bytes',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_contractAddress',
        type: 'address',
      },
    ],
    name: 'getLatestForContractAddress',
    outputs: [
      {
        name: 'semanticVersion',
        type: 'uint16[3]',
      },
      {
        name: 'contractAddress',
        type: 'address',
      },
      {
        name: 'contentURI',
        type: 'bytes',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_semanticVersion',
        type: 'uint16[3]',
      },
    ],
    name: 'getBySemanticVersion',
    outputs: [
      {
        name: 'semanticVersion',
        type: 'uint16[3]',
      },
      {
        name: 'contractAddress',
        type: 'address',
      },
      {
        name: 'contentURI',
        type: 'bytes',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_versionId',
        type: 'uint256',
      },
    ],
    name: 'getByVersionId',
    outputs: [
      {
        name: 'semanticVersion',
        type: 'uint16[3]',
      },
      {
        name: 'contractAddress',
        type: 'address',
      },
      {
        name: 'contentURI',
        type: 'bytes',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getVersionsCount',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_oldVersion',
        type: 'uint16[3]',
      },
      {
        name: '_newVersion',
        type: 'uint16[3]',
      },
    ],
    name: 'isValidBump',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
];

const kernelABI = [
  {
    constant: true,
    inputs: [],
    name: 'hasInitialized',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'KERNEL_APP_ID',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'APP_ADDR_NAMESPACE',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getRecoveryVault',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_appBase',
        type: 'address',
      },
      {
        name: '_initializePayload',
        type: 'bytes',
      },
      {
        name: '_setDefault',
        type: 'bool',
      },
    ],
    name: 'newAppInstance',
    outputs: [
      {
        name: 'appProxy',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '',
        type: 'bytes32',
      },
      {
        name: '',
        type: 'bytes32',
      },
    ],
    name: 'apps',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_baseAcl',
        type: 'address',
      },
      {
        name: '_permissionsCreator',
        type: 'address',
      },
    ],
    name: 'initialize',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'CORE_NAMESPACE',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
    name: 'allowRecoverability',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_appBase',
        type: 'address',
      },
    ],
    name: 'newAppInstance',
    outputs: [
      {
        name: 'appProxy',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'recoveryVaultAppId',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getInitializationBlock',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_recoveryVaultAppId',
        type: 'bytes32',
      },
    ],
    name: 'setRecoveryVaultAppId',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'APP_MANAGER_ROLE',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_appBase',
        type: 'address',
      },
    ],
    name: 'newPinnedAppInstance',
    outputs: [
      {
        name: 'appProxy',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_token',
        type: 'address',
      },
    ],
    name: 'transferToVault',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_namespace',
        type: 'bytes32',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_app',
        type: 'address',
      },
    ],
    name: 'setApp',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_namespace',
        type: 'bytes32',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
    ],
    name: 'getApp',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_appBase',
        type: 'address',
      },
      {
        name: '_initializePayload',
        type: 'bytes',
      },
      {
        name: '_setDefault',
        type: 'bool',
      },
    ],
    name: 'newPinnedAppInstance',
    outputs: [
      {
        name: 'appProxy',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_kernel',
        type: 'address',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_initializePayload',
        type: 'bytes',
      },
    ],
    name: 'newAppProxyPinned',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'APP_BASES_NAMESPACE',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'acl',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'isPetrified',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_kernel',
        type: 'address',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
    ],
    name: 'newAppProxy',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'DEFAULT_ACL_APP_ID',
    outputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    payable: false,
    stateMutability: 'pure',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_kernel',
        type: 'address',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
      {
        name: '_initializePayload',
        type: 'bytes',
      },
    ],
    name: 'newAppProxy',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_who',
        type: 'address',
      },
      {
        name: '_where',
        type: 'address',
      },
      {
        name: '_what',
        type: 'bytes32',
      },
      {
        name: '_how',
        type: 'bytes',
      },
    ],
    name: 'hasPermission',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_kernel',
        type: 'address',
      },
      {
        name: '_appId',
        type: 'bytes32',
      },
    ],
    name: 'newAppProxyPinned',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: '_shouldPetrify',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        name: 'proxy',
        type: 'address',
      },
      {
        indexed: false,
        name: 'isUpgradeable',
        type: 'bool',
      },
      {
        indexed: false,
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'NewAppProxy',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'vault',
        type: 'address',
      },
      {
        indexed: true,
        name: 'token',
        type: 'address',
      },
      {
        indexed: false,
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'RecoverToVault',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'namespace',
        type: 'bytes32',
      },
      {
        indexed: true,
        name: 'appId',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'app',
        type: 'address',
      },
    ],
    name: 'SetApp',
    type: 'event',
  },
];
// xDAI
// const HOST = "0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6";
// const CFAv1 = "0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A";

// Polygon
const HOST = '0x3E14dC1b13c488a8d5D310918780c983bD5982E7';
const CFAv1 = '0x6EeE6060f715257b970700bc2656De21dEdF074C';

const VOTING = '0x99b260f28b3e99cdde935f3e20fcf4f1bdf06834';
const AGENT = '0x2ce7a97f8673abad6e9cc4e3dd145b959f8c2819';

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  // const evmcrispr = await EVMcrispr.create("0x83D2B45368006c3b7b7C7e8142f9a265945aF75a", signer);
  console.log(await signer.getAddress());

  const kernel = new Contract(
    '0xBe8662dAB072FBF66738c244c1e28d401cC5935b',
    kernelABI,
    signer,
  );
  const res = await kernel['newAppInstance(bytes32,address,bytes,bool)'](
    '0xa9018c6bf815a34270ddb31e49fa0acc1f51e6c50b9ab47b0bd14cd9fd65b059',
    '0xf913C388302996575E2dA5922E19048a63e75063',
    '0xc0c53b8b0000000000000000000000002ce7a97f8673abad6e9cc4e3dd145b959f8c28190000000000000000000000003e14dc1b13c488a8d5d310918780c983bd5982e70000000000000000000000006eee6060f715257b970700bc2656de21dedf074c',
    false,
    { gasPrice: 40e9 },
  );
  const a = await res.wait();
  console.log(a);
  // await evmcrispr.forward(
  //   [
  //     evmcrispr.install("superfluid.open:demo", [AGENT, HOST, CFAv1]),
  //     evmcrispr.grantPermissions(
  //       [
  //         [VOTING, "superfluid.open:demo", "MANAGE_STREAMS_ROLE"],
  //         [VOTING, "superfluid.open:demo", "SET_AGENT_ROLE"],
  //         ["superfluid.open:demo", AGENT, "SAFE_EXECUTE_ROLE"],
  //         ["superfluid.open:demo", AGENT, "TRANSFER_ROLE"],
  //       ],
  //       VOTING
  //     ),
  //   ],
  //   [VOTING]
  // );

  // await evmcrispr.forward(
  //   [
  //     evmcrispr.install("superfluid.open:demo", ["agent", HOST, CFAv1]),
  //     evmcrispr.grantPermissions(
  //       [
  //         ["voting", "superfluid.open:demo", "MANAGE_STREAMS_ROLE"],
  //         ["voting", "superfluid.open:demo", "SET_AGENT_ROLE"],
  //         ["superfluid.open:demo", "agent", "SAFE_EXECUTE_ROLE"],
  //         ["superfluid.open:demo", "agent", "TRANSFER_ROLE"],
  //       ],
  //       "voting"
  //     ),
  //   ],
  //   ["voting"]
  // );

  // const res = await org.describeScript(
  //   "0xd948d468000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000003c000000001709e31ba29fb84000f20045590ec664bfc3cdc1d000003a4d948d46800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000360000000010466e612137bca50e524f25ac9f7b6f826ee15b700000344b61d27f6000000000000000000000000c18360217d8f7ab5e7c516566761ea12ce7f9d720000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002a4761229030000000000000000000000000000000000000000000000094c6e0dfb5ba67000000000000000000000000000839395e20bbb182fa440d08f850e6c7a8f6f078000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000011f2dd05481168107cf149933603d4e31530fb51573bc318067f2467831e9d9d54f1e76e9c26b503495945f06fb6f4da9a09dc5276d9ab0834f82eae2be71ccef265a8d544767eeb4b9677ae19a8d4f7d8ef841f568fff8dba9deb18798a9b2d504ef26734661f3a0782732624b17e67b318ed230952e58368efecc7df8fdaf108e2e0c56046b625300da5e9a2a0291bda8f933e6bdc54118e69fed8b1e0408ae87ebe9cbd0a4561a757ae1eada062789d2e0ab4aadb8944b37dece81b224ac08cb8cc934a3c2db0c4066404e1a378c415e49b298d90a284520f9830b7731c23a5c89ed77cb01ed66ea9e7762167685e1801b88a3f882f9f6c6405248254659887d52c345845821462f27f0d24119760d96253135602c151cdd617ee2e073297e385190eb575a218561be34604b15d3e1307033da10ed7add198d8579c94852928b989141b004b8f6c56fb67cd0aaaa19d848f3898250dbacc53e8db31b91aa762146f5b40431a43d62bf95f8a99cb357071d4395d7188fd5e6d27f30d0708ae5c61b2b174e0e50875a6d9e97cb01a7f8543c9361a6d3ced452f7f5d1789b29b3ce6aeb748fda35545a3e8dabb9941794cabe473f00c99578ca6a3b65eaa1dd9cf2fa54d3908362801203e3d5ecca30bfbda6651562777284a20792b86e6d238b6fda9eaaba947a96278ea2d70e5235d27812ff4f438150c4c0450d6d57e49ec5c0b8e3f753c0ae0482b1980cbad3eac8d727ae0c0f40d9c23f2e8c8b08e4e9d7b00000000000000000000000000000000000000000000000000000000"
  // );

  // console.log(ecode);

  // console.log(res.)
  // evmcrispr.forward(
  //   evmcl`
  //   connect 0xd3b4048623028cd1e09ab5192eb2612e9ce339d2 hooked-token-manager.open voting
  //   exec hooked-token-manager.open revokeVesting 0x74f72193E880cD5E903CB3cfD2d282fC5F214b28 0
  //   exec hooked-token-manager.open revokeVesting 0x851fB899dA7F80c211d9B8e5f231FB3BC9eca41a 0
  //   exec hooked-token-manager.open revokeVesting 0x86Da253817DC599059e3AD5A1F098F7b96aBf34c 0
  //   act agent 0x2abeb846160b92ecc9b4773e2d95df4766a52eb9 revoke()
  // `,
  //   ["hooked-token-manager.open", "voting"]
  // );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
