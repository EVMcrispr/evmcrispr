import React, { useEffect, useState } from 'react';
import AceEditor from 'react-ace';

import "ace-builds/src-noconflict/mode-jade";
import "ace-builds/src-noconflict/theme-vibrant_ink";

import { ethers } from 'ethers';
import { evmcl, EVMcrispr } from "@1hive/evmcrispr";
import { version } from "@1hive/evmcrispr/package.json"

declare global {
  interface Window {
      ethereum: any;
      evmcrispr: any;
  }
}

function client(chainId: number) {
  return ({
    1: "client.aragon.org",
    4: "rinkeby.client.aragon.org",
    100: "aragon.1hive.org"
  })[chainId];
}

function App() {
  const [provider, setProvider] = useState(new ethers.providers.Web3Provider(window.ethereum));
  const [address, setAddress] = useState("");
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState(
`# Available commands:

connect <dao> <...path> [-context:https://yoursite.com]
install <repo> [...initParams]
grant <entity> <app> <role> [permissionManager]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]

# Example (unwrap wxDAI):

connect 1hive token-manager voting
install agent:new-agent
grant voting agent:new-agent TRANSFER_ROLE voting
exec vault transfer -token:tokens.honeyswap.org:WXDAI agent:new-agent 100e18
act agent:new-agent -token:tokens.honeyswap.org:WXDAI withdraw(uint256) 100e18
exec agent:new-agent transfer -token:XDAI vault 100e18
`);
  useEffect(() => {
    provider.getSigner().getAddress().then(setAddress).catch(() => setAddress(""));
  }, [provider]);
  const addressShortened = `${address.substr(0,4)}..${address.substr(-4)}`;
  async function onClick() {
    const [ , dao] = code.split('\n')[0].match(/^connect ([\w.-]+)(( [\w.\-:]+)*)( @context:(.+))?$/) ?? [];
    const evmcrispr = await EVMcrispr.create(dao, provider.getSigner() as any, {
      ipfsGateway: "https://ipfs.blossom.software/ipfs/"
    });
    window.evmcrispr = evmcrispr;
  }
  async function onForward() {
    setError('');
    setLoading(true);
    try{
      const [ , dao, _path,,, context ] = code.split('\n')[0].match(/^connect ([\w.-]+)(( [\w.\-:]+)*)( @context:(.+))?$/) ?? [];
      if (!dao || !_path) {
        console.log(dao, _path)
        throw new Error("First line must be `connect <dao> <...path>`");
      }
      if (!/0x[0-9A-Fa-f]+/.test(dao)) {
        throw new Error("ENS not supported yet, please introduce the address of the DAO.");
      }
      const path = _path.trim().split(' ').map(id => id.trim());
      const _code = code.split("\n").slice(1).join("\n");
      const evmcrispr = await EVMcrispr.create(dao, provider.getSigner() as any, {
        ipfsGateway: "https://ipfs.blossom.software/ipfs/"
      });
      await evmcrispr.forward(
        evmcl`${_code}`,
        path,
        { context },
      );
      const chainId = (await provider.getNetwork()).chainId;
      const lastApp = evmcrispr.app(path.slice(-1)[0]);
      setUrl(`https://${client(chainId)}/#/${dao}/${lastApp}`);
    } catch (e: any) {
      console.error(e);
      if (e.message.startsWith('transaction failed') && /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])) {
        setError(`Transaction failed, watch in block explorer ${e.message.split('"')[1]}`);
      } else {
        setError(e.message);
      }
    }
    setLoading(false);
  }
  async function onConnect() {
    await window.ethereum.send('eth_requestAccounts')
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const address = await provider.getSigner().getAddress();
    console.log(`Connected to ${address}.`);
    setProvider(provider);
  }
  return (
    <div className="App" style={{maxWidth: 1200, margin: "auto"}}>
      <h1 onClick={onClick}>evm-crispr terminal v{version}</h1>
      <AceEditor
        width="100%"
        mode="jade"
        theme="vibrant_ink"
        name="code"
        value={code}
        onChange={setCode}
        fontSize={24}
        showPrintMargin={true}
        showGutter={true}
        highlightActiveLine={true}
        setOptions={{
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        showLineNumbers: true,
        tabSize: 2,
        }}/>
        <div style={{textAlign: 'right'}}>
          {
            !address ?
              <input type="button" value="Connect" onClick={onConnect} /> :
              <>
                {url ?? <input type="button" value="Go to vote" onClick={() => window.open(url, "_blank")} />}
                <input type="button" value={`${loading ? "Forwarding" : "Forward"} from ${addressShortened}`} onClick={onForward} />
              </>
          }
        </div>
        <div style={{color: 'red'}}>{error ? "Error: " + error : null}</div>
    </div>
  );
}

export default App;
