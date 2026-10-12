import { expect, test } from "bun:test";
import { loadMonaco } from "../../src/editor/load-monaco";

/** A loader as `@monaco-editor/loader` behaves: `init()` gives a promise
 *  with `cancel()`, and cancelling REJECTS it with a marker object. */
function fakeLoader<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    resolve,
    fail: (reason: unknown) => reject(reason),
    init: () =>
      Object.assign(promise, {
        cancel: () =>
          reject({
            type: "cancelation",
            msg: "operation is manually canceled",
          }),
      }),
  };
}

async function unhandledDuring(run: () => void) {
  const seen: unknown[] = [];
  const listen = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listen);
  run();
  await new Promise((done) => setTimeout(done, 20));
  process.off("unhandledRejection", listen);
  return seen;
}

test("cancelling before Monaco has loaded rejects nothing and reports nothing", async () => {
  const loader = fakeLoader<string>();
  const loaded: string[] = [];
  const failed: unknown[] = [];
  const unhandled = await unhandledDuring(() => {
    const cancel = loadMonaco(
      loader,
      (m) => loaded.push(m),
      (e) => failed.push(e),
    );
    cancel();
  });
  expect(unhandled).toEqual([]);
  expect(loaded).toEqual([]);
  expect(failed).toEqual([]);
});

test("Monaco, once loaded, is handed over", async () => {
  const loader = fakeLoader<string>();
  const loaded: string[] = [];
  loadMonaco(
    loader,
    (m) => loaded.push(m),
    () => {},
  );
  loader.resolve("monaco");
  await new Promise((done) => setTimeout(done, 5));
  expect(loaded).toEqual(["monaco"]);
});

test("a real failure to load is reported, not swallowed", async () => {
  const loader = fakeLoader<string>();
  const failed: unknown[] = [];
  const unhandled = await unhandledDuring(() => {
    loadMonaco(
      loader,
      () => {},
      (e) => failed.push(e),
    );
    loader.fail(new Error("/vs/loader.js: 404"));
  });
  expect(unhandled).toEqual([]);
  expect(failed.map(String)).toEqual(["Error: /vs/loader.js: 404"]);
});
