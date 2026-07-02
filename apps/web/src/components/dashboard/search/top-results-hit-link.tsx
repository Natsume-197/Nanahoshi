import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import { Link } from "@tanstack/react-router";

export function HitLink({
	hit,
	className,
	children,
}: {
	hit: TopHit;
	className?: string;
	children: React.ReactNode;
}) {
	const shared = { preload: "intent", className } as const;
	switch (hit.type) {
		case "book":
			return (
				<Link
					to="/dashboard/books/$uuid"
					params={{ uuid: hit.uuid }}
					{...shared}
				>
					{children}
				</Link>
			);
		case "audiobook":
			return (
				<Link
					to="/dashboard/audiobooks/$uuid"
					params={{ uuid: hit.uuid }}
					{...shared}
				>
					{children}
				</Link>
			);
		case "series":
			return (
				<Link
					to="/dashboard/series/$seriesName"
					params={{ seriesName: hit.name }}
					{...shared}
				>
					{children}
				</Link>
			);
		case "author":
			return (
				<Link
					to="/dashboard/authors/$authorId"
					params={{ authorId: String(hit.id) }}
					{...shared}
				>
					{children}
				</Link>
			);
		case "collection":
			return (
				<Link
					to="/dashboard/collections/$collectionId"
					params={{ collectionId: hit.id }}
					{...shared}
				>
					{children}
				</Link>
			);
		case "user":
			return (
				<Link
					to="/dashboard/user/$username"
					params={{ username: hit.username ?? "" }}
					{...shared}
				>
					{children}
				</Link>
			);
	}
}
