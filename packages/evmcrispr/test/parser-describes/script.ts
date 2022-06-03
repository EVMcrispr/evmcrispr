import { parseScript } from '../../src/cas11/parsers/script';
import { deepConsoleLog } from '../test-helpers/cas11';

export const scriptParserDescribe = (): Mocha.Suite =>
  describe('Script parser', () => {
    const script = `









      
  forward token-manager voting agent (
    set $agent finance:vault()
    forward wrappable-token-manager.open disputable-voting.open agent (
      sf batchcall (
        flow create @token('fDAIx') $agent 1e18mo
      )
    )
  )

  token approve @token('DAI') @me 15.45e18 
`;

    it('should parse an script correctly', () => {
      console.log(script.length);
      deepConsoleLog(parseScript(script));
    });
  });
