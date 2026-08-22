import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

/**
 * previewLink additions for the invite page: `requiresDiscord` (the target
 * server has enabled Discord access rules) and `discordLinked` (the viewer has
 * a linked Discord account). Repositories are singletons, so their methods are
 * patched in place and restored — never mocked via mock.module (it leaks
 * across test files sharing the Bun process).
 */

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "mock@example.com",
		SMTP_PASS: "mock",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { inviteLinkService } = await import("../invite-link.service");
const { inviteLinkRepository } = await import("../invite-link.repository");
const { discordAccessRepository } = await import(
	"../../../lib/discord-access.repository"
);

const LINK = {
	id: "link-1",
	code: "CODE",
	serverId: "org-1",
	role: "member",
	revokedAt: null,
	expiresAt: null,
	maxUses: null,
	useCount: 0,
};

const SERVER = {
	name: "Nanahoshi",
	logo: null,
	background: null,
	memberCount: 3,
	bookCount: 42,
};

const originals = {
	findByCode: inviteLinkRepository.findByCode,
	getServerPreview: inviteLinkRepository.getServerPreview,
	isMember: inviteLinkRepository.isMember,
	getEnabledRules: discordAccessRepository.getEnabledRules,
	getDiscordAccount: discordAccessRepository.getDiscordAccount,
};

beforeAll(() => {
	inviteLinkRepository.findByCode = mock(async () => LINK) as never;
	inviteLinkRepository.getServerPreview = mock(async () => SERVER) as never;
	inviteLinkRepository.isMember = mock(async () => false) as never;
});

afterAll(() => {
	Object.assign(inviteLinkRepository, {
		findByCode: originals.findByCode,
		getServerPreview: originals.getServerPreview,
		isMember: originals.isMember,
	});
	Object.assign(discordAccessRepository, {
		getEnabledRules: originals.getEnabledRules,
		getDiscordAccount: originals.getDiscordAccount,
	});
});

describe("inviteLinkService.previewLink", () => {
	test("no enabled rules → requiresDiscord false", async () => {
		discordAccessRepository.getEnabledRules = mock(async () => []) as never;
		discordAccessRepository.getDiscordAccount = mock(async () => null) as never;

		const preview = await inviteLinkService.previewLink({ code: "CODE" });
		expect(preview.status).toBe("ok");
		if (preview.status !== "ok") return;
		expect(preview.requiresDiscord).toBe(false);
		expect(preview.discordLinked).toBe(false);
	});

	test("enabled rules → requiresDiscord true", async () => {
		discordAccessRepository.getEnabledRules = mock(async () => [
			{ id: "r1", serverId: "org-1", guildId: "g1", roleId: null },
		]) as never;

		const preview = await inviteLinkService.previewLink({ code: "CODE" });
		expect(preview.status).toBe("ok");
		if (preview.status !== "ok") return;
		expect(preview.requiresDiscord).toBe(true);
	});

	test("viewer with a linked Discord account → discordLinked true", async () => {
		discordAccessRepository.getDiscordAccount = mock(async () => ({
			id: "acc-1",
			accessToken: "t",
			refreshToken: "r",
			accessTokenExpiresAt: null,
		})) as never;

		const preview = await inviteLinkService.previewLink({
			code: "CODE",
			userId: "user-1",
		});
		expect(preview.status).toBe("ok");
		if (preview.status !== "ok") return;
		expect(preview.discordLinked).toBe(true);
	});

	test("a Discord row without an access token is not 'linked'", async () => {
		// checkDiscordAccess needs the token, so the join button would 403.
		discordAccessRepository.getDiscordAccount = mock(async () => ({
			id: "acc-1",
			accessToken: null,
			refreshToken: null,
			accessTokenExpiresAt: null,
		})) as never;

		const preview = await inviteLinkService.previewLink({
			code: "CODE",
			userId: "user-1",
		});
		expect(preview.status).toBe("ok");
		if (preview.status !== "ok") return;
		expect(preview.discordLinked).toBe(false);
	});

	test("without a session the Discord account is never looked up", async () => {
		const spy = mock(async () => null);
		discordAccessRepository.getDiscordAccount = spy as never;

		await inviteLinkService.previewLink({ code: "CODE" });
		expect(spy).not.toHaveBeenCalled();
	});

	test("unusable links still short-circuit before any extra lookups", async () => {
		inviteLinkRepository.findByCode = mock(async () => ({
			...LINK,
			revokedAt: new Date(),
		})) as never;

		const preview = await inviteLinkService.previewLink({ code: "CODE" });
		expect(preview.status).toBe("revoked");

		inviteLinkRepository.findByCode = mock(async () => LINK) as never;
	});
});
