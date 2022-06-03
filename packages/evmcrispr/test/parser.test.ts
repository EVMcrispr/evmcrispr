import {
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
} from './parsers';

describe.only('cas11 parsers', () => {
  primaryParsersDescribe();

  callParserDescribe();

  helperParserDescribe();

  commandParserDescribe();
});
