import {
  arrayParserDescribe,
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';

describe('CAS11 Parsers', () => {
  primaryParsersDescribe();

  arrayParserDescribe();

  callParserDescribe();

  helperParserDescribe();

  commandParserDescribe();

  scriptParserDescribe();
});
