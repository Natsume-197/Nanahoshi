import { describe, expect, it } from "bun:test";
import { buildInviteHead, type InviteHeadPreview } from "../invite-meta";

const logoUrl = "https://api.example.com/api/data/server-logos/a.avif";
const backgroundUrl =
	"https://api.example.com/api/data/server-backgrounds/b.avif";

const okPreview: InviteHeadPreview = {
	status: "ok",
	serverName: "Biblioteca",
	serverLogo: logoUrl,
	serverBackground: backgroundUrl,
	memberCount: 12,
	bookCount: 3400,
};

const findMeta = (
	head: ReturnType<typeof buildInviteHead>,
	key: { name?: string; property?: string },
) =>
	head.meta.find(
		(entry) =>
			(key.name && entry.name === key.name) ||
			(key.property && entry.property === key.property),
	);

describe("buildInviteHead", () => {
	it("always emits noindex, even without a preview", () => {
		for (const head of [
			buildInviteHead(null),
			buildInviteHead(undefined),
			buildInviteHead({ status: "expired" }),
			buildInviteHead(okPreview),
		]) {
			expect(findMeta(head, { name: "robots" })?.content).toBe("noindex");
		}
	});

	it("emits only noindex for non-ok previews", () => {
		expect(buildInviteHead({ status: "invalid" }).meta).toHaveLength(1);
		expect(buildInviteHead(null).meta).toHaveLength(1);
	});

	it("builds title and description from server name and counts", () => {
		const head = buildInviteHead(okPreview);
		const title = head.meta.find((entry) => entry.title)?.title;
		expect(title).toContain("Biblioteca");
		expect(findMeta(head, { property: "og:title" })?.content).toBe(title);
		const description = findMeta(head, { name: "description" })?.content;
		expect(description).toContain("12");
		expect(description).toContain("3400");
		expect(findMeta(head, { property: "og:description" })?.content).toBe(
			description,
		);
		expect(findMeta(head, { property: "og:site_name" })?.content).toBe(
			"Nanahoshi",
		);
	});

	it("prefers the logo as a small summary card", () => {
		const head = buildInviteHead(okPreview);
		expect(findMeta(head, { property: "og:image" })?.content).toBe(logoUrl);
		expect(findMeta(head, { name: "twitter:card" })?.content).toBe("summary");
	});

	it("falls back to the background as a large card", () => {
		const head = buildInviteHead({ ...okPreview, serverLogo: null });
		expect(findMeta(head, { property: "og:image" })?.content).toBe(
			backgroundUrl,
		);
		expect(findMeta(head, { name: "twitter:card" })?.content).toBe(
			"summary_large_image",
		);
	});

	it("omits image tags when the server has neither image", () => {
		const head = buildInviteHead({
			...okPreview,
			serverLogo: null,
			serverBackground: null,
		});
		expect(findMeta(head, { property: "og:image" })).toBeUndefined();
		expect(findMeta(head, { name: "twitter:card" })).toBeUndefined();
	});
});
