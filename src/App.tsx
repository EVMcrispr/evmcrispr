import React, { useEffect, useState } from 'react';
import AceEditor from 'react-ace';

import "ace-builds/src-noconflict/mode-jade";
import "ace-builds/src-noconflict/theme-vibrant_ink";

import { ethers, providers } from 'ethers';
import { evmcl, EVMcrispr } from "@1hive/evmcrispr";
import { version } from "@1hive/evmcrispr/package.json"
import { codename, sponsors } from "./sponsors.json";

declare global {
  interface Window {
      ethereum: any;
      evmcrispr: any;
  }
}

async function dao(code: string, provider: providers.Web3Provider) {
  let [ , dao, _path,,, context ] = code.split('\n')[0].match(/^connect ([\w.-]+)(( [\w.\-:]+)*)( --context:(.+))?$/) ?? [];
  if (!dao || !_path) {
    console.log(dao, _path)
    throw new Error("First line must be `connect <dao> <...path>`");
  }
  const path = _path.trim().split(' ').map(id => id.trim());
  const _code = code.split("\n").slice(1).join("\n");
  const evmcrispr = await EVMcrispr.create(dao, provider.getSigner() as any, {
    ipfsGateway: "https://ipfs.blossom.software/ipfs/"
  });
  return { dao, path, context, _code, evmcrispr };
  
}

function client(chainId: number) {
  return ({
    1: "client.aragon.org",
    4: "rinkeby.client.aragon.org",
    100: "aragon.1hive.org"
  })[chainId];
}

function network(ethereum: {chainId: string}): providers.Network | undefined {
  return ({
    1: {
      name: "mainnet",
      chainId: 1,
      ensAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    },
    4: {
      name: "rinkeby",
      chainId: 4,
      ensAddress: "0x98Df287B6C145399Aaa709692c8D308357bC085D",
    },
    100: {
      name: "xdai",
      chainId: 100,
      ensAddress: "0xaafca6b0c89521752e559650206d7c925fd0e530",
    }
  })[Number(ethereum.chainId)];
}

function parsedSponsors(){
  switch (sponsors.length) {
    case 1:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>`;
    case 2:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a> and <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>`;
    case 3:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>, <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>, and <a href="${sponsors[2][1]}">${sponsors[2][0]}</a>`;
    default:
      return "";
  }
}

function App() {
  const [provider, setProvider] = useState(new ethers.providers.Web3Provider(window.ethereum, network(window.ethereum)));
  const [address, setAddress] = useState("");
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState(
`# Available commands:

connect <dao> <...path> [--context:https://yoursite.com]
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
`);
  useEffect(() => {
    provider.getSigner().getAddress().then(setAddress).catch(() => setAddress(""));
  }, [provider]);
  const addressShortened = `${address.slice(0,6)}..${address.slice(-4)}`;
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
    setError('');
    setLoading(true);
    try{
      const { evmcrispr, _code, path, context } = await dao(code, provider);
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
    const provider = new ethers.providers.Web3Provider(window.ethereum, network(window.ethereum));
    const address = await provider.getSigner().getAddress();
    console.log(`Connected to ${address}.`);
    setProvider(provider);
  }
  return (
    <div className="App" style={{maxWidth: 1200, margin: "auto"}}>
      <header>
        <h1 onClick={onClick}>evm-crispr {codename ?? `"${codename}"`} v{version}</h1>
        <small dangerouslySetInnerHTML={{__html: parsedSponsors()}}></small>
      </header>
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
