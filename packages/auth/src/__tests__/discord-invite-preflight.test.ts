import { describe, expect, mock, test } from "bun:test";
import { satisfiesDiscordAccessRules } from "../discord-invite-preflight";

describe("satisfiesDiscordAccessRules", () => {
	test("allows an ungated server without calling Discord", async () => {
		const getGuildMember = mock(async () => null);

		expect(await satisfiesDiscordAccessRules([], getGuildMember)).toBe(true);
		expect(getGuildMember).not.toHaveBeenCalled();
	});

	test("allows membership-only rules when the user is in the guild", async () => {
		const getGuildMember = mock(async () => ({ roles: [] }));

		expect(
			await satisfiesDiscordAccessRules(
				[{ guildId: "guild-1", roleId: null }],
				getGuildMember,
			),
		).toBe(true);
	});

	test("rejects a user outside the required guild", async () => {
		expect(
			await satisfiesDiscordAccessRules(
				[{ guildId: "guild-1", roleId: null }],
				async () => null,
			),
		).toBe(false);
	});

	test("requires the configured role when a rule has one", async () => {
		const rules = [{ guildId: "guild-1", roleId: "role-1" }];

		expect(
			await satisfiesDiscordAccessRules(rules, async () => ({ roles: [] })),
		).toBe(false);
		expect(
			await satisfiesDiscordAccessRules(rules, async () => ({
				roles: ["role-1"],
			})),
		).toBe(true);
	});

	test("grants access when any one of several rules matches", async () => {
		const getGuildMember = mock(async (guildId: string) =>
			guildId === "guild-2" ? { roles: ["role-2"] } : null,
		);

		expect(
			await satisfiesDiscordAccessRules(
				[
					{ guildId: "guild-1", roleId: "role-1" },
					{ guildId: "guild-2", roleId: "role-2" },
				],
				getGuildMember,
			),
		).toBe(true);
		expect(getGuildMember).toHaveBeenCalledTimes(2);
	});

	test("fails closed on a Discord lookup error and tries later rules", async () => {
		const getGuildMember = mock(async (guildId: string) => {
			if (guildId === "guild-1") throw new Error("network unavailable");
			return { roles: ["role-2"] };
		});

		expect(
			await satisfiesDiscordAccessRules(
				[
					{ guildId: "guild-1", roleId: "role-1" },
					{ guildId: "guild-2", roleId: "role-2" },
				],
				getGuildMember,
			),
		).toBe(true);
	});

	test("fails closed when every Discord lookup is unavailable", async () => {
		expect(
			await satisfiesDiscordAccessRules(
				[{ guildId: "guild-1", roleId: "role-1" }],
				async () => {
					throw new Error("network unavailable");
				},
			),
		).toBe(false);
	});
});
