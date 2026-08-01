import pino from "pino";
import { logBufferDestination } from "./log-buffer";

// Read process.env directly (not the validated env) so the logger stays a leaf
// module — importing it must never trigger full env validation.
const isProd = process.env.ENVIRONMENT === "production";
const usePrettyTransport = !isProd && process.stdout.isTTY === true;

const options: pino.LoggerOptions = {
	level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
	timestamp: pino.stdTimeFunctions.isoTime,
	// Defense in depth: keep secrets/PII out of logs even if an object carrying
	// them is ever passed to the logger. Paths are first-level since structured
	// fields are logged flat (e.g. log.error({ sig }, ...)).
	redact: [
		"req.headers.cookie",
		"req.headers.authorization",
		"password",
		"newPassword",
		"currentPassword",
		"token",
		"accessToken",
		"refreshToken",
		"apiKey",
		"secret",
		"sig",
		"cookie",
		"authorization",
	],
};

const consoleDestination = usePrettyTransport
	? pino.transport({
			target: "pino-pretty",
			options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
		})
	: pino.destination(1);

export const logger = pino(
	options,
	pino.multistream([
		{ stream: consoleDestination },
		{ stream: logBufferDestination },
	]),
);
