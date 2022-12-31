import { server } from './src/server';
const URL_WHITELIST = ['http://localhost:8545/', 'http://localhost:8545'];

beforeAll(() =>
  server.listen({
    onUnhandledRequest: (req) => {
      if (URL_WHITELIST.includes(req.url.origin)) {
        return 'bypass';
      }

      // Display warning when running on node.js environment
      console.warn(`WARNING: Unhandled request: ${req.url}`);
      return 'warn';
    },
  }),
);

beforeEach(() => server.resetHandlers());

afterAll(() => server.close());
