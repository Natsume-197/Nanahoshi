import { describe, expect, test } from "bun:test";
import {
	isTransientDbError,
	RanobedbUnavailableError,
} from "../ranobedb-errors";

describe("isTransientDbError", () => {
	test("classifies connection-level SQLSTATEs as transient", () => {
		for (const code of ["08006", "57P03", "53300", "40001", "55P03", "57014"]) {
			expect(isTransientDbError({ code })).toBe(true);
		}
	});

	test("classifies node socket/DNS errors as transient", () => {
		for (const code of [
			"ECONNREFUSED",
			"ETIMEDOUT",
			"ENOTFOUND",
			"ECONNRESET",
		]) {
			expect(isTransientDbError({ code })).toBe(true);
		}
	});

	test("treats structural-absence SQLSTATEs as a soft miss, not transient", () => {
		// 3D000 invalid_catalog_name (RanobeDB db absent), 42P01 undefined_table
		// (not imported / mid-import), 42703 undefined_column (schema drift).
		for (const code of ["3D000", "42P01", "42703", "22P02"]) {
			expect(isTransientDbError({ code })).toBe(false);
		}
	});

	test("falls back to the message when there is no SQLSTATE code", () => {
		expect(
			isTransientDbError(new Error("Connection terminated unexpectedly")),
		).toBe(true);
		expect(
			isTransientDbError(new Error("timeout exceeded when trying to connect")),
		).toBe(true);
		expect(
			isTransientDbError(new Error("sorry, too many clients already")),
		).toBe(true);
	});

	test("does not treat an ordinary query error as transient", () => {
		expect(
			isTransientDbError(new Error('syntax error at or near "SELCT"')),
		).toBe(false);
		expect(isTransientDbError(null)).toBe(false);
		expect(isTransientDbError("boom")).toBe(false);
		expect(isTransientDbError(undefined)).toBe(false);
	});

	test("RanobedbUnavailableError carries its name and cause", () => {
		const cause = new Error("ECONNREFUSED");
		const err = new RanobedbUnavailableError("down", { cause });
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("RanobedbUnavailableError");
		expect(err.cause).toBe(cause);
	});
});
