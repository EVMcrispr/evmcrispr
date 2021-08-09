import artifactKernel from "../artifacts/Kernel.json";
import artifactACL from "../artifacts/ACL.json";
import artifactEVMScriptRegistry from "../artifacts/EVMScriptRegistry.json";

//acl.aragonpm.eth
const ACL_APP_ID = "0xe3262375f45a6e2026b7e7b18c2b807434f2508fe1a2a3dfb493c7df8f4aad6a";
// kernel.aragonpm.eth
const KERNEL_APP_ID = "0x3b4bf6bf3ad5000ecf0f989d5befde585c6860fea3e574a4fab4c49d1c177d9c";
// evmreg.aragonpm.eth
const EVM_SCRIPT_REGISTRY_APP_ID = "0xddbcfd564f642ab5627cf68b9b7d374fb4f8a36e941a75d89c87998cef03bd61";

const SYSTEM_APP_ID_NAMES = {
  [ACL_APP_ID]: "acl",
  [EVM_SCRIPT_REGISTRY_APP_ID]: "evm-script-registry",
  [KERNEL_APP_ID]: "kernel",
};

const SYSTEM_APPS_ARTIFACTS: { [key: string]: any } = {
  [ACL_APP_ID]: artifactACL,
  [EVM_SCRIPT_REGISTRY_APP_ID]: artifactEVMScriptRegistry,
  [KERNEL_APP_ID]: artifactKernel,
};

export const getSystemAppArtifactByAppId = (appId: string): any => SYSTEM_APPS_ARTIFACTS[appId] || null;

export const getSystemAppNameByAppId = (appId: string): string => SYSTEM_APP_ID_NAMES[appId] || null;
