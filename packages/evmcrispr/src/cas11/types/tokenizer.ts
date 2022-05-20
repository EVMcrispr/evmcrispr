export enum TokenType {
  KEYWORD = 'KEYWORD',
  IDENTIFIER = 'IDENTIFIER',
  COMMAND = 'COMMAND',
  BOOLEAN = 'BOOLEAN',
  NUMBER = 'NUMBER',
  HEXADECIMAL = 'HEXADECIMAL',
  ADDRESS = 'ADDRESS',
  STRING = 'STRING',
  PUNTUATION = 'PUNTUATION',
}

export enum KeywordValue {
  AS = 'as',
  CONNECT = 'connect',
  LOAD = 'load',
}

export enum PunctuationValue {
  LEFT_PAREN = '(',
  RIGHT_PAREN = ')',
  COMMA = ',',
  DOT = '.',
  COLON = ':',
  AT = '@',
  PLUS = '+',
  MINUS = '-',
  SLASH = '/',
  STAR = '*',
  POWER = '^',
  PERCENTAGE = '%',
}

export interface Token {
  type: TokenType;
  value: any;
}

export interface KeywordToken extends Token {
  type: TokenType.KEYWORD;
  value: KeywordValue;
}

export interface PunctuationToken extends Token {
  type: TokenType.PUNTUATION;
  value: PunctuationValue;
}

// TODO: implement string regex
// const STRING_REGEX = /[a-zA-Z0-0]/
