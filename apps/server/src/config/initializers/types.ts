import type { Hono } from "hono";

export interface RuntimeContext {
	app: Hono;
}

export interface RuntimeInitializer {
	name: string;
	initialize: (context: RuntimeContext) => Promise<void> | void;
	shutdown?: (context: RuntimeContext) => Promise<void> | void;
}
