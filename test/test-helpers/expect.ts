import { expect } from "chai";

export const expectThrowAsync = async (
  method: () => any,
  errorOptions: { type: any; name?: string; message?: string } = { type: Error },
  customTestMessage = ""
) => {
  let error: Error | null = null;
  try {
    await method();
  } catch (err: any) {
    error = err;
  }
  const { type, name, message } = errorOptions;

  expect(error, `Exception not thrown`).not.to.be.null;
  expect(error!.constructor.name, customTestMessage).eq(type.name);

  if (name) {
    expect(error!.name, customTestMessage).to.be.eq(name);
  }

  if (message) {
    expect(error!.message, customTestMessage).to.equal(message);
  }
};
