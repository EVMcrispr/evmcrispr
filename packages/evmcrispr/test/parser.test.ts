import {
  arithmeticParserDescribe,
  arrayParserDescribe,
  callParserDescribe,
  commandParserDescribe,
  commentParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';

describe.only('CAS11 Parsers', () => {
  arithmeticParserDescribe();

  arrayParserDescribe();

  callParserDescribe();

  commandParserDescribe();

  commentParserDescribe();

  helperParserDescribe();

  primaryParsersDescribe();

  scriptParserDescribe();
});
