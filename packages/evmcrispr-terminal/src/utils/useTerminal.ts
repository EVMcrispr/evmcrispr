import { evmcl } from '@1hive/evmcrispr';
import { useEffect, useState } from 'react';
import createPersistedState from 'use-persisted-state';
import { useConnect, useSigner } from 'wagmi';

import { client, dao } from './utils';

const useCodeState = createPersistedState<string>('code');

declare global {
  interface Window {
    evmcrispr: any;
  }
}

export const useTerminal = () => {
  const { data: signer } = useSigner();
  const { connect, connectors } = useConnect();
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [code, setCode] = useCodeState(
    `# Available commands:

connect <dao> <...path> [@context:https://yoursite.com]
install <repo> [...initParams]
grant <entity> <app> <role> [permissionManager]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]

# Example (unwrap wxDAI):

connect 1hive token-manager voting
install agent:new
grant voting agent:new TRANSFER_ROLE voting
exec vault transfer @token(WXDAI) agent:new 100e18
act agent:new @token(WXDAI) withdraw(uint256) 100e18
exec agent:new transfer XDAI vault 100e18
`,
  );

  useEffect(() => {
    if (!signer) return;
    signer
      .getAddress()
      .then(setAddress)
      .catch(() => setAddress(''));
  }, [signer]);

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  async function onClick() {
    console.log('Loading current terminal in window.evmcrispr…');
    try {
      if (signer === undefined || signer === null)
        throw new Error('Account not connected');
      const { evmcrispr } = await dao(code, signer);
      window.evmcrispr = evmcrispr;
      console.log(evmcrispr);
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
      const {
        evmcrispr,
        _code,
        dao: _dao,
        path,
        context,
      } = await dao(code, signer);
      await evmcrispr.forward(evmcl`${_code}`, path, {
        context,
        gasLimit: 10_000_000,
      });
      const chainId = (await signer.provider?.getNetwork())?.chainId;
      const lastApp = evmcrispr.app(path.slice(-1)[0]);
      setUrl(`https://${client(chainId)}/#/${_dao}/${lastApp}`);
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

  async function onConnect() {
    connect(connectors[0]);
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
    onConnect,
  };
};
