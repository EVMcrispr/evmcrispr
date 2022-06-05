import {
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';

describe('CAS11 Parsers', () => {
  primaryParsersDescribe();

  callParserDescribe();

  helperParserDescribe();

  commandParserDescribe();

  scriptParserDescribe();
});
