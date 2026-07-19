import { m } from "@/paraglide/messages";

export interface InviteHeadPreview {
	status: "ok" | "invalid" | "expired" | "revoked" | "exhausted";
	serverName?: string;
	serverLogo?: string | null;
	serverBackground?: string | null;
	memberCount?: number;
	bookCount?: number;
}

interface HeadMetaEntry {
	title?: string;
	name?: string;
	property?: string;
	content?: string;
}

/**
 * Head tags for /invite/$code. Rendered during SSR so link-unfurl bots
 * (Discord, WhatsApp, Telegram — none execute JS) get a rich card, while
 * `noindex` keeps invite codes out of search engines: they are semi-private
 * tokens, so this applies even when the link is invalid or expired.
 */
export function buildInviteHead(preview: InviteHeadPreview | null | undefined) {
	const meta: HeadMetaEntry[] = [{ name: "robots", content: "noindex" }];
	if (preview?.status !== "ok") return { meta };

	const title = `${m["invite.invited_to_join"]()} ${preview.serverName}`;
	const description = `${m["invite.member_count"]({
		count: preview.memberCount ?? 0,
	})} · ${m["invite.book_count"]({ count: preview.bookCount ?? 0 })}`;

	meta.push(
		{ title },
		{ name: "description", content: description },
		{ property: "og:site_name", content: "Nanahoshi" },
		{ property: "og:type", content: "website" },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
	);

	const image = preview.serverLogo ?? preview.serverBackground;
	if (image) {
		meta.push(
			{ property: "og:image", content: image },
			{
				// Logos are square crops → small summary card; backgrounds are wide.
				name: "twitter:card",
				content: preview.serverLogo ? "summary" : "summary_large_image",
			},
		);
	}
	return { meta };
}
