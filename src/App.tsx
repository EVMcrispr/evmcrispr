import React, { useEffect, useState } from 'react';
import AceEditor from 'react-ace';

import "ace-builds/src-noconflict/mode-jade";
import "ace-builds/src-noconflict/theme-vibrant_ink";

import { ethers } from 'ethers';
// import { JsonRpcSigner } from '@ethersproject/providers';
import { evmcl, EVMcrispr } from "@commonsswarm/evmcrispr";

declare global {
  interface Window {
      ethereum:any;
  }
}

function client(chainId: number) {
  return ({
    4: "rinkeby.client.aragon.org",
    100: "aragon.1hive.org"
  })[chainId];
}

function App() {
  const [provider, setProvider] = useState(new ethers.providers.Web3Provider(window.ethereum));
  const [address, setAddress] = useState("");
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(
`dao <your-dao> token-manager voting
exec token-manager mint <addr> 1e18
exec token-manager burn <addr> 1e18
exec finance newImmediatePayment <token-addr> <receiver> 0.5e18 payment`);
  useEffect(() => {
    provider.getSigner().getAddress().then(setAddress);
  }, [provider]);
  const addressShortened = `${address.substr(0,4)}..${address.substr(-4)}`;
  async function onForward() {
    setError('');
    setLoading(true);
    try{
      const [ , dao, _path ] = code.split('\n')[0].match(/^dao (0x[0-9A-Fa-f]+)(( [\w.-:]+)*)$/) ?? [];
      if (!dao || !_path) {
        throw new Error("First line must be `dao <addr> <forward-path>`");
      }
      const path = _path.trim().split(' ').map(id => id.trim());
      const _code = code.split("\n").slice(1).join("\n");
      const evmcrispr = await EVMcrispr.create(dao, provider.getSigner());
      await evmcrispr.forward(
        evmcl`${_code}`,
        path
      );
      const chainId = (await provider.getNetwork()).chainId;
      const lastApp = evmcrispr.app(path.slice(-1)[0]);
      window.location.href = `https://${client(chainId)}/#/${dao}/${lastApp}`
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
      <h1>evm-crispr terminal</h1>
      <AceEditor
        width="100%"
        mode="jade"
        theme="vibrant_ink"
        name="code"
        value={code}
        onLoad={() => console.log('load')}
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
            !window.ethereum?.isConnected() ? <input type="button" value="Connect" onClick={onConnect} /> : <input type="button" value={`${loading ? "Forwarding" : "Forward"} from ${addressShortened}`} onClick={onForward} />
          }
        </div>
        <div style={{color: 'red'}}>{error ? "Error: " + error : null}</div>
    </div>
  );
}

export default App;
