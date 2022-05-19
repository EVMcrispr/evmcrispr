import { Contract, ethers } from 'ethers';
import { useEffect, useState } from 'react';
import createPersistedState from 'use-persisted-state';

import { network } from './utils';

const useCodeState = createPersistedState<string>('code');

declare global {
  interface Window {
    ethereum: any;
  }
}

export const useTerminal = () => {
  const [provider, setProvider] = useState(
    new ethers.providers.Web3Provider(
      window.ethereum,
      network(window.ethereum),
    ),
  );
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const url = '';
  const [code, setCode] = useCodeState(``);

  useEffect(() => {
    provider
      .getSigner()
      .getAddress()
      .then(setAddress)
      .catch(() => setAddress(''));
  }, [provider]);

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  async function onClick() {
    console.log('nothing..');
  }

  async function onForward() {
    setError('');
    setLoading(true);

    try {
      const singer = provider.getSigner();
      console.log(singer);

      const hashes = code.split('\n').map((hash) => hash.trim());
      const files = await Promise.all(
        hashes.map((hash) =>
          fetch('https://ipfs.blossom.software/ipfs/' + hash).then((data) =>
            data.json(),
          ),
        ),
      );

      console.log(files);

      const relayer = new Contract(
        '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7',
        [
          'function executeBatch(uint256 _nonce, address[] calldata recipients, uint256[] calldata amounts) external',
        ],
        provider.getSigner(),
      );

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        for (let j = 0; j < file.length; j++) {
          const batch = file[j];
          await relayer.executeBatch(
            batch.nonce,
            batch.recipients,
            batch.amounts,
          );
        }
      }
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
    await window.ethereum.send('eth_requestAccounts');
    const provider = new ethers.providers.Web3Provider(
      window.ethereum,
      network(window.ethereum),
    );
    const address = await provider.getSigner().getAddress();
    console.log(`Connected to ${address}.`);
    setProvider(provider);
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
