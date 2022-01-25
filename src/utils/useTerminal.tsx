import { useState, useEffect } from "react";
import { network, dao, client } from "../utils/utils";
import createPersistedState from "use-persisted-state";
import { ethers } from "ethers";
import { evmcl } from "@1hive/evmcrispr";

const useCodeState = createPersistedState("code");

declare global {
  interface Window {
    ethereum: any;
    evmcrispr: any;
  }
}

export const useTerminal = () => {
  const [provider, setProvider] = useState(
    new ethers.providers.Web3Provider(window.ethereum, network(window.ethereum))
  );
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
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
`
  );

  useEffect(() => {
    provider
      .getSigner()
      .getAddress()
      .then(setAddress)
      .catch(() => setAddress(""));
  }, [provider]);

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  async function onClick() {
    try {
      const { evmcrispr } = await dao(code, provider);
      window.evmcrispr = evmcrispr;
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    }
  }

  async function onForward() {
    setError("");
    setLoading(true);

    try {
      const { evmcrispr, _code, path, context } = await dao(code, provider);
      await evmcrispr.forward(evmcl`${_code}`, path, {
        context,
        gasLimit: 10_000_000,
      });
      const chainId = (await provider.getNetwork()).chainId;
      const lastApp = evmcrispr.app(path.slice(-1)[0]);
      setUrl(`https://${client(chainId)}/#/${dao}/${lastApp}`);
    } catch (e: any) {
      console.error(e);
      if (
        e.message.startsWith("transaction failed") &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        setError(
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`
        );
      } else {
        setError(e.message);
      }
    }
    setLoading(false);
  }

  async function onConnect() {
    await window.ethereum.send("eth_requestAccounts");
    const provider = new ethers.providers.Web3Provider(
      window.ethereum,
      network(window.ethereum)
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
