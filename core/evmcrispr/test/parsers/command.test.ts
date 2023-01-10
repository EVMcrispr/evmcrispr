import { runParser, runParserError } from '@1hive/evmcrispr-test-common';
import type { Case } from '@1hive/evmcrispr-test-common';

import {
  commandExpressionParser,
  commandOptParser,
} from '../../src/parsers/command';

describe.concurrent('Parsers - command expression', () => {
  const trailingWhitspacesCommand = `install wrapper-hooked-token-manager 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0`;

  describe.concurrent.each<Case>([
    {
      title: 'with helper function and call expression',
      value:
        'my-command @ipfs("upload this to ipfs") contract::getData("param1", false, an-identifier, @me) anotherIdentifier.open',
    },
    { title: 'load', value: 'load superfluid' },
    { title: 'with as expression', value: 'load aragonos as ar' },
    { title: 'switch', value: 'switch gnosis' },
    { title: 'set', value: `set $new-variable 'a variable'` },
    { title: 'without args', value: `mod:no-arg-command` },
    {
      title: 'with optional args',
      value: `'example-command myArg1 125.23e18 @aHelper(contract::getSomething(), false) "text" --option1 optionValue --something-else @token(DAI) --anotherOne 1e18'`,
    },
    {
      title: 'with in-between optional args',
      value: `exec 0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374 --inBetween a::getInfo() 1e18 --another-one @token.balance(GIV, @me) @token(DAI, "see") (
      inside-command @me --t "testing" 25e16
      another-ne token-manager:0 superfluid.open:3 --default true
    ) --lastOne false`,
    },
    {
      title: 'with right trailing whitespaces',
      value: `${trailingWhitspacesCommand}    `,
    },
    {
      title: 'with left trailing whitespaces',
      value: `   ${trailingWhitspacesCommand}`,
    },
    {
      title: 'with in-between trailing whitespaces',
      value: `${trailingWhitspacesCommand.slice(
        0,
        7,
      )}       ${trailingWhitspacesCommand.slice(
        7,
        trailingWhitspacesCommand.length,
      )}`,
    },
    {
      title: 'followed by block experssions',
      value: `forward token-manager voting agent (     
      set $agent $finance::vault()
      forward wrappable-token-manager.open disputable-voting.open agent (
        sf:batchcall (
          flow create @token(fDAIx) $agent 1e18mo     
        )     
      )
    )`,
    },
  ])('', ({ title, value }) => {
    it(`should parse a command ${title} correctly`, () => {
      const parsedValue = runParser(commandExpressionParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });

  describe.concurrent.each<Case>([
    { title: 'invalid module name', value: 'asda2345:asd' },
    { title: 'invalid command name', value: 'my-command:wer234' },
    { title: 'incomplete command name', value: 'my-command:' },
  ])('', ({ title, value }) => {
    it(`should fail when parsing an ${title}`, () => {
      const error = runParserError(commandExpressionParser, value);

      expect(error).toMatchSnapshot();
    });
  });

  it('should fail when parsing an invalid opt name', () => {
    const error = runParserError(commandOptParser, '--asd$ asd');

    expect(error).toMatchSnapshot();
  });
});
