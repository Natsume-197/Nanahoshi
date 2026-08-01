import { describe, expect, it } from "bun:test";
import { revokeAllSessionsAndSignOut } from "../revoke-all-sessions";

describe("revokeAllSessionsAndSignOut", () => {
	it("revokes every server session before clearing the browser session", async () => {
		const calls: string[] = [];
		const client = {
			revokeSessions: async () => {
				calls.push("revokeSessions");
			},
			signOut: async () => {
				calls.push("signOut");
			},
		};

		await revokeAllSessionsAndSignOut(client);

		expect(calls).toEqual(["revokeSessions", "signOut"]);
	});
});
