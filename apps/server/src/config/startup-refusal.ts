// Why this process refused to start. Safe mode shows the code's sentence, so
// each one names what happened and what fixes it.
export type StartupRefusalCode =
	| "database-newer"
	| "backup-failed"
	| "migration-failed"
	| "startup-failed";

export class StartupRefusal extends Error {
	constructor(
		readonly code: StartupRefusalCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "StartupRefusal";
	}
}

export function toStartupRefusal(error: unknown): StartupRefusal {
	if (error instanceof StartupRefusal) return error;
	return new StartupRefusal(
		"startup-failed",
		error instanceof Error ? error.message : String(error),
		{ cause: error },
	);
}
