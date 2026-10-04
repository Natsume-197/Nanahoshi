import { describe, expect, it } from "bun:test";
import { UpdateInstanceNameInput } from "../instance.model";
import { normalizeInstanceName, randomInstanceName } from "../instance-name";

describe("randomInstanceName", () => {
	it("pairs an adjective with a star", () => {
		expect(randomInstanceName(() => 0)).toBe("Quiet Vega");
		expect(randomInstanceName(() => 0.999)).toBe("Golden Antares");
	});
});

describe("instance name input", () => {
	it("collapses whitespace before storing", () => {
		expect(normalizeInstanceName("  Casa   de  libros ")).toBe(
			"Casa de libros",
		);
		expect(UpdateInstanceNameInput.parse({ name: " 七星  文庫 " }).name).toBe(
			"七星 文庫",
		);
	});

	it("rejects blank and overlong names", () => {
		expect(UpdateInstanceNameInput.safeParse({ name: "   " }).success).toBe(
			false,
		);
		expect(
			UpdateInstanceNameInput.safeParse({ name: "x".repeat(61) }).success,
		).toBe(false);
	});
});
