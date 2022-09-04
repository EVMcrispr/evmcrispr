import type { Action, ForwardOptions } from '@1hive/evmcrispr';
import { EVMcrispr, parseScript } from '@1hive/evmcrispr';
import { isProviderAction } from '@1hive/evmcrispr/src/types';
import type { providers } from 'ethers';
import { useState } from 'react';
import createPersistedState from 'use-persisted-state';
import type { Connector } from 'wagmi';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

const useCodeState = createPersistedState<string>('code');

declare global {
  interface Window {
    evmcrispr: any;
  }
}

// TODO: Migrate logic to evmcrispr
const executeActions = async (
  actions: Action[],
  connector: Connector,
  options?: ForwardOptions,
): Promise<providers.TransactionReceipt[]> => {
  const txs = [];

  if (!(connector instanceof InjectedConnector)) {
    throw new Error(
      `Provider action-returning commands are only supported by injected wallets (e.g. Metamask)`,
    );
  }

  for (const action of actions) {
    if (isProviderAction(action)) {
      const [chainParam] = action.params;

      await connector.switchChain(Number(chainParam.chainId));
    } else {
      const signer = await connector.getSigner();
      txs.push(
        await (
          await signer.sendTransaction({
            ...action,
            gasPrice: options?.gasPrice,
            gasLimit: options?.gasLimit,
          })
        ).wait(),
      );
    }
  }
  return txs;
};

export const useTerminal = () => {
  const { data: account } = useAccount();
  const { activeConnector } = useConnect();
  const { disconnect } = useDisconnect();
  const address = account?.address || '';
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [url] = useState('');
  const [code, setCode] = useCodeState(
    `# Available commands:

load <module> [as <alias>]
switch <chainId>
connect <dao> <...path> [--context https://yoursite.com] (
  <...commands>
)
install <repo> [...initParams] [--version <version>]
grant <entity> <app> <role> [permissionManager] [--oracle <entity>]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]

# Example (unwrap wxDAI):
load aragonos as ar

ar:connect 1hive token-manager voting (
  install agent:new
  grant voting agent:new TRANSFER_ROLE voting
  exec vault transfer @token(WXDAI) agent:new 100e18
  act agent:new @token(WXDAI) withdraw(uint256) 100e18
  exec agent:new transfer XDAI vault 100e18
)
`,
  );

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  async function onClick() {
    console.log('Loading current terminal in window.evmcrispr…');

    // try {
    //   if (signer === undefined || signer === null)
    //     throw new Error('Account not connected');
    //   // const evmcrispr = await evmcl`${code}`.evmcrispr(signer);
    //   // window.evmcrispr = evmcrispr;
    // } catch (e: any) {
    //   console.error(e);
    //   setErrors([e.message]);
    // }
  }

  async function onForward() {
    setErrors([]);
    setLoading(true);

    try {
      const signer = await activeConnector?.getSigner();
      if (!activeConnector || signer === undefined || signer === null)
        throw new Error('Account not connected');

      const { ast, errors } = parseScript(code);

      if (errors.length) {
        setLoading(false);
        setErrors(errors);
        return;
      }
      const crispr = new EVMcrispr(ast, signer);

      const actions = await crispr.interpret();

      await executeActions(actions, activeConnector, { gasLimit: 10_000_000 });

      // TODO: adapt to cas11 changes
      // const chainId = (await signer.provider?.getNetwork())?.chainId;
      // setUrl(`https://${client(chainId)}/#/${connectedDAO.kernel.address}/${}`);
    } catch (err: any) {
      const e = err as Error;
      console.error(e);
      if (
        e.message.startsWith('transaction failed') &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        setErrors([
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`,
        ]);
      } else {
        setErrors([e.message]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onDisconnect() {
    setErrors([]);
    disconnect();
  }

  return {
    errors,
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
