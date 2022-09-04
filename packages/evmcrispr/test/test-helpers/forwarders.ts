export const CONTEXT_FORWARDER_TYPE = 'FORWARDER_WITH_CONTEXT';
export const FORWARDER_TYPE = 'FORWARDER';
export const FEE_FORWARDER_TYPE = 'FEE_FORWARDER';

const forwarderApps = ['agent', 'voting', 'token-manager', 'tollgate.open'];
const forwarderWithContextApps = ['disputable-voting.open'];

export const getAppForwarderType = (appName: string): string => {
  if (forwarderApps.includes(appName)) {
    return FORWARDER_TYPE;
  } else if (forwarderWithContextApps.includes(appName)) {
    return CONTEXT_FORWARDER_TYPE;
  } else {
    return '';
  }
};
