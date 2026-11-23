import { describe, expect, test } from "bun:test";
import { pairingStatus } from "../mobile-connect.rules";

describe("mobile connect status", () => {
	const now = new Date("2026-11-23T12:00:00Z");
	const later = { expiresAt: new Date("2026-11-23T12:05:00Z") };
	const earlier = { expiresAt: new Date("2026-11-23T11:55:00Z") };

	test("waits while the code is unused and alive", () => {
		expect(pairingStatus({ pending: later, paired: null, now }).status).toBe(
			"pending",
		);
	});

	test("reports the phone once it traded the code", () => {
		expect(pairingStatus({ pending: null, paired: later, now }).status).toBe(
			"paired",
		);
	});

	test("a code past its time is expired even if never consumed", () => {
		expect(pairingStatus({ pending: earlier, paired: null, now }).status).toBe(
			"expired",
		);
		expect(pairingStatus({ pending: null, paired: null, now }).status).toBe(
			"expired",
		);
	});
});
