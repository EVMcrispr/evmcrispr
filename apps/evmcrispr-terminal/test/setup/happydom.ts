import { TransformStream, WritableStream } from "node:stream/web";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// happy-dom overwrites `TransformStream` with node:stream's `Transform` (a
// Node stream, not the WHATWG one), which leaves it incompatible with the
// `ReadableStream` it keeps. Anything piping through a transform — the AI
// SDK's `streamText`, for one — then dies with "readable should be
// ReadableStream". Put the web versions back.
Object.assign(globalThis, { TransformStream, WritableStream });
