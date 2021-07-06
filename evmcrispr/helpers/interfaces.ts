import artifactKernel from "../artifacts/Kernel.json";
import artifactACL from "../artifacts/ACL.json";
import artifactEVMScriptRegistry from "../artifacts/EVMScriptRegistry.json";

const SYSTEM_APPS_ARTIFACTS: { [key: string]: any } = {
  acl: artifactACL,
  kernel: artifactKernel,
  "evm-script-registry": artifactEVMScriptRegistry,
};

export const getSystemAppArtifact = (app: string): any => SYSTEM_APPS_ARTIFACTS[app] || null;
