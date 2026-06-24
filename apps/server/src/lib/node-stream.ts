import type fs from "node:fs";

// Hono's types only accept web streams, but Bun's Response handles Node streams.
export const asBody = (stream: fs.ReadStream) =>
	stream as unknown as ReadableStream;
