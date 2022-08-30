import {
  arithmeticParserDescribe,
  arrayParserDescribe,
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';

describe('CAS11 Parsers', () => {
  arithmeticParserDescribe();

  arrayParserDescribe();

  callParserDescribe();

  commandParserDescribe();

  helperParserDescribe();

  primaryParsersDescribe();

  scriptParserDescribe();
});
