import { describe, expect, test } from "bun:test";
import { DEFAULT_LOG_CAPACITY, LogBuffer } from "../log-buffer";

describe("LogBuffer", () => {
	test("parses Pino records and returns the newest entry first", () => {
		const buffer = new LogBuffer(5, "server");
		buffer.write(
			'{"level":30,"time":"2026-08-01T12:00:00.000Z","pid":1,"hostname":"host","requestId":"a","msg":"Started"}\n',
		);
		buffer.write(
			'{"level":50,"time":"2026-08-01T12:01:00.000Z","err":{"message":"Nope"},"msg":"Failed"}\n',
		);

		expect(buffer.list()).toEqual([
			{
				id: expect.stringMatching(/^server:.+:2$/),
				timestamp: "2026-08-01T12:01:00.000Z",
				level: "error",
				source: "server",
				message: "Failed",
				context: { err: { message: "Nope" } },
			},
			{
				id: expect.stringMatching(/^server:.+:1$/),
				timestamp: "2026-08-01T12:00:00.000Z",
				level: "info",
				source: "server",
				message: "Started",
				context: { requestId: "a" },
			},
		]);
	});

	test("keeps only its configured capacity", () => {
		const buffer = new LogBuffer(2);
		for (let index = 1; index <= 3; index++) {
			buffer.write(`{"level":30,"msg":"Entry ${index}"}\n`);
		}

		expect(buffer.list().map((entry) => entry.message)).toEqual([
			"Entry 3",
			"Entry 2",
		]);
	});

	test("keeps the latest 1000 entries by default", () => {
		const buffer = new LogBuffer();
		for (let index = 1; index <= DEFAULT_LOG_CAPACITY + 1; index++) {
			buffer.write(`{"level":30,"msg":"Entry ${index}"}\n`);
		}

		const entries = buffer.list();
		expect(entries).toHaveLength(1000);
		expect(entries[0]?.message).toBe("Entry 1001");
		expect(entries.at(-1)?.message).toBe("Entry 2");
	});

	test("ignores malformed and unsupported records", () => {
		const buffer = new LogBuffer();
		buffer.write('not-json\n{"level":99,"msg":"Unknown"}\n');

		expect(buffer.list()).toEqual([]);
	});

	test("redacts sensitive fields at any nesting level", () => {
		const buffer = new LogBuffer();
		buffer.write(
			'{"level":50,"request":{"headers":{"authorization":"Bearer secret"}},"apiKey":"secret","msg":"Failed"}\n',
		);

		expect(buffer.list()[0]?.context).toEqual({
			request: { headers: { authorization: "[Redacted]" } },
			apiKey: "[Redacted]",
		});
	});

	test("publishes new entries to subscribers with their process source", () => {
		const buffer = new LogBuffer(5, "worker");
		const received: string[] = [];
		const unsubscribe = buffer.subscribe((entry) => {
			received.push(`${entry.source}:${entry.message}`);
		});

		buffer.write('{"level":30,"msg":"First"}\n');
		unsubscribe();
		buffer.write('{"level":30,"msg":"Second"}\n');

		expect(received).toEqual(["worker:First"]);
	});
});
