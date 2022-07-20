import { useState } from 'react';
import createPersistedState from 'use-persisted-state';
import { useAccount, useDisconnect, useSigner } from 'wagmi';

import { client } from './utils';

const useCodeState = createPersistedState<string>('code');

declare global {
  interface Window {
    evmcrispr: any;
  }
}

export const useTerminal = () => {
  const { data: signer } = useSigner();
  const { data: account } = useAccount();
  const { disconnect } = useDisconnect();
  const address = account?.address || '';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [code, setCode] = useCodeState(
    `# Available commands:

connect <dao> <...path> [--context https://yoursite.com] (
  <...commands>
)
install <repo> [...initParams] [--version <version>]
grant <entity> <app> <role> [permissionManager] [--oracle <entity>]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]

# Example (unwrap wxDAI):

connect 1hive token-manager voting (
  install agent:new
  grant voting agent:new TRANSFER_ROLE voting
  exec vault transfer @token(WXDAI) agent:new 100e18
  act agent:new @token(WXDAI) withdraw(uint256) 100e18
  exec agent:new transfer XDAI vault 100e18
)
`,
  );

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  async function onClick() {
    console.log('Loading current terminal in window.evmcrispr…');
    try {
      if (signer === undefined || signer === null)
        throw new Error('Account not connected');
      if (!isSafari) {
        const { evmcl } = await import('@1hive/evmcrispr');
        const evmcrispr = await evmcl`${code}`.evmcrispr(signer);
        window.evmcrispr = evmcrispr;
        console.log(evmcrispr);
      } else {
        throw new Error('Browser not supported');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    }
  }

  async function onForward() {
    setError('');
    setLoading(true);

    try {
      if (signer === undefined || signer === null)
        throw new Error('Account not connected');
      await evmcl`${code}`.forward(signer, {
        gasLimit: 10_000_000,
      });
      const chainId = (await signer.provider?.getNetwork())?.chainId;
      const { dao, path, evmcrispr } = evmcl`${code}`;
      const lastApp = (await (await evmcrispr(signer)).aragon.dao(dao)).app(
        path.slice(-1)[0],
      ).address;
      setUrl(`https://${client(chainId)}/#/${dao}/${lastApp}`);
    } catch (e: any) {
      console.error(e);
      if (
        e.message.startsWith('transaction failed') &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        setError(
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`,
        );
      } else {
        setError(e.message);
      }
    }
    setLoading(false);
  }

  async function onDisconnect() {
    setError('');
    disconnect();
  }

  return {
    error,
    loading,
    url,
    code,
    setCode,
    address,
    addressShortened,
    onClick,
    onForward,
    onDisconnect,
  };
};
