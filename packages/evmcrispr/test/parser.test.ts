import {
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
} from './parser-describes';

describe.only('cas11 parsers', () => {
  primaryParsersDescribe();

  callParserDescribe();

  helperParserDescribe();

  commandParserDescribe();
});
