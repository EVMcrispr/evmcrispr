export const CONTEXT_FORWARDER_TYPE = 'FORWARDER_WITH_CONTEXT';
export const FORWARDER_TYPE = 'FORWARDER';
export const FEE_FORWARDER_TYPE = 'FEE_FORWARDER';

const forwarderApps = [
  'agent',
  'voting',
  'token-manager',
  'tollgate.open',
  'tollgate.1hive',
];
const forwarderWithContextApps = ['disputable-voting.open'];

export const getAppForwarderType = (appName: string): string => {
  const matchIndex = appName.indexOf(':');
  const appName_ = matchIndex > -1 ? appName.slice(0, matchIndex) : appName;
  if (forwarderApps.includes(appName_)) {
    return FORWARDER_TYPE;
  } else if (forwarderWithContextApps.includes(appName_)) {
    return CONTEXT_FORWARDER_TYPE;
  } else {
    return '';
  }
};
