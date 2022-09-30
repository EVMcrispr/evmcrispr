export abstract class DataProvider {
  constructor(readonly id: string) {}

  // [type, label]
  abstract getIdentifiers(addPrefix: boolean): [string, string];
}
