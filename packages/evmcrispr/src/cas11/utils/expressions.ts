export enum CallableExpression {
  Call = 'Call',
  Command = 'Command',
  Helper = 'Helper',
}

export enum ComparisonType {
  Between = 'Between',
  Equal = 'Equal',
  Greater = 'Greater',
}

export interface Comparison {
  type: ComparisonType;
  minValue: number;
  maxValue?: number;
}
