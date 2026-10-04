import { describe, expect, test } from "bun:test";
import { mapGoogleProfileToUser } from "../google-profile";

describe("mapGoogleProfileToUser", () => {
	test("username comes from the email, made unique by the account id", () => {
		expect(
			mapGoogleProfileToUser({
				sub: "109876543210",
				email: "Ana.Perez@gmail.com",
				name: "Ana Pérez",
			}),
		).toEqual({ username: "ana.perez_543210", displayUsername: "Ana Pérez" });
	});

	test("two people with the same email name never share a username", () => {
		const a = mapGoogleProfileToUser({ sub: "111111", email: "kai@a.com" });
		const b = mapGoogleProfileToUser({ sub: "222222", email: "kai@b.com" });
		expect(a.username).not.toBe(b.username);
	});

	test("stays within the 30-character username limit", () => {
		const { username } = mapGoogleProfileToUser({
			sub: "123456789",
			email: `${"x".repeat(60)}@gmail.com`,
		});
		expect(username.length).toBeLessThanOrEqual(30);
	});

	test("an email with no usable name still gets a valid username", () => {
		expect(
			mapGoogleProfileToUser({ sub: "987654", email: "李@example.com" })
				.username,
		).toBe("user_987654");
	});
});
