import { runParser } from '@1hive/evmcrispr-test-common';

import { scriptParser } from '../../src/parsers/script';

describe('Parsers - script', () => {
  it('should parse an script correctly', () => {
    const script = `
      load aragonos as ar
      load superfluid as sf\r\n
      
      ar:connect my-dao-ens (   
        forward token-manager voting      (
          install wrapper-hooked-token-manager.open 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0
        
        
        )     




        forward token-manager voting agent (
          
          set $agent finance::vault()

          forward wrappable-token-manager.open disputable-voting.open agent (
            set $daix @token("fDAIx")







            
            sf:token approve @token('DAI') @me 15.45e18


            sf:batchcall (
              token upgrade $daix 4500.43e18
              flow create $daix $agent 1e18mo
              token downgrade @token('USDCx')
            )


          )
          
          
        ) 
        
        
                          )
  
  
      
      `;
    const parsedScript = runParser(scriptParser, script);

    expect(parsedScript).to.matchSnapshot();
  });
});
