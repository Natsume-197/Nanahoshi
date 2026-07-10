import type { Hono } from "hono";

export interface RuntimeContext {
	// Absent in the worker process, which runs no HTTP server.
	app?: Hono;
}

export interface RuntimeInitializer {
	name: string;
	initialize: (context: RuntimeContext) => Promise<void> | void;
	shutdown?: (context: RuntimeContext) => Promise<void> | void;
}
