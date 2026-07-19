import { describe, expect, it } from "bun:test";
import { createBufferingIndicator } from "../buffering-indicator";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY = 30;

describe("createBufferingIndicator", () => {
	it("stays quiet for a stall that resolves within the grace period", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		await sleep(DELAY / 3);
		indicator.resume();
		await sleep(DELAY * 2);

		expect(seen).toEqual([]);
	});

	it("surfaces a stall that outlasts the grace period", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		await sleep(DELAY * 2);

		expect(seen).toEqual([true]);
	});

	it("clears once data arrives", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		await sleep(DELAY * 2);
		indicator.resume();

		expect(seen).toEqual([true, false]);
	});

	it("ignores repeated stalls instead of stacking timers", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		indicator.stall();
		indicator.stall();
		await sleep(DELAY * 2);
		indicator.stall();
		await sleep(DELAY * 2);

		expect(seen).toEqual([true]);
	});

	it("stays silent on the readiness events that fire while nothing is stalled", () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.resume();
		indicator.resume();

		expect(seen).toEqual([]);
	});

	it("can stall again after resuming", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		await sleep(DELAY * 2);
		indicator.resume();
		indicator.stall();
		await sleep(DELAY * 2);

		expect(seen).toEqual([true, false, true]);
	});

	it("drops an armed timer on dispose", async () => {
		const seen: boolean[] = [];
		const indicator = createBufferingIndicator((v) => seen.push(v), DELAY);

		indicator.stall();
		indicator.dispose();
		await sleep(DELAY * 2);

		expect(seen).toEqual([]);
	});
});
