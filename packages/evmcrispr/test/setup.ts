import { server } from "./fixtures/server.js";

server.listen({
  onUnhandledRequest: "bypass",
});
