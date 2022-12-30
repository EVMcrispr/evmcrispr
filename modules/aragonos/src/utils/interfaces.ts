import artifactACL from '../system-artifacts/ACL.json';
import artifactEVMScriptRegistry from '../system-artifacts/EVMScriptRegistry.json';
import artifactKernel from '../system-artifacts/Kernel.json';

// acl.aragonpm.eth
const ACL_APP_ID =
  '0xe3262375f45a6e2026b7e7b18c2b807434f2508fe1a2a3dfb493c7df8f4aad6a';
// evmreg.aragonpm.eth
const EVM_SCRIPT_REGISTRY_APP_ID =
  '0xddbcfd564f642ab5627cf68b9b7d374fb4f8a36e941a75d89c87998cef03bd61';
// kernel.aragonpm.eth
const KERNEL_APP_ID =
  '0x3b4bf6bf3ad5000ecf0f989d5befde585c6860fea3e574a4fab4c49d1c177d9c';

const SYSTEM_APPS: Map<string, { name: string; artifact: any }> = new Map([
  [ACL_APP_ID, { name: 'acl', artifact: artifactACL }],
  [
    EVM_SCRIPT_REGISTRY_APP_ID,
    { name: 'evm-script-registry', artifact: artifactEVMScriptRegistry },
  ],
  [KERNEL_APP_ID, { name: 'kernel', artifact: artifactKernel }],
]);

export const isSystemApp = (appId: string): boolean => SYSTEM_APPS.has(appId);

export const getSystemApp = (
  appId: string,
): { name: string; artifact: any } | undefined => SYSTEM_APPS.get(appId);
