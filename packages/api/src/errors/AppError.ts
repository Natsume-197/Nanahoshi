export interface AppErrorJSON {
	code: string;
	title: string;
	detail: string;
	status: number;
}

export abstract class AppError extends Error {
	abstract readonly code: string;
	abstract readonly title: string;
	abstract readonly status: number;

	constructor(detail: string) {
		super(detail);
		this.name = this.constructor.name;
	}

	toJSON(): AppErrorJSON {
		return {
			code: this.code,
			title: this.title,
			detail: this.message,
			status: this.status,
		};
	}
}

export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}
