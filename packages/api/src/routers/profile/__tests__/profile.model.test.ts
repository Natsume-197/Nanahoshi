import { describe, expect, it } from "bun:test";
import { UpdateProfileInput } from "../profile.model";

describe("UpdateProfileInput profileColor", () => {
	it("accepts a 6-digit hex color", () => {
		const result = UpdateProfileInput.safeParse({ profileColor: "#5865f2" });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.profileColor).toBe("#5865f2");
	});

	it("accepts uppercase hex digits", () => {
		expect(
			UpdateProfileInput.safeParse({ profileColor: "#A855F7" }).success,
		).toBe(true);
	});

	it("accepts null to clear the color", () => {
		const result = UpdateProfileInput.safeParse({ profileColor: null });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.profileColor).toBeNull();
	});

	it("leaves the color untouched when omitted", () => {
		const result = UpdateProfileInput.safeParse({ name: "Nana" });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.profileColor).toBeUndefined();
	});

	it.each([
		"5865f2", // missing #
		"#5865f", // too short
		"#5865f21", // too long
		"#58 5f2", // whitespace
		"#gggggg", // non-hex digits
		"red", // named color
		"rgb(1,2,3)", // css function — would be injected into inline styles
	])("rejects %p", (value) => {
		expect(UpdateProfileInput.safeParse({ profileColor: value }).success).toBe(
			false,
		);
	});
});
