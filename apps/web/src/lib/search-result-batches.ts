import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";

export function searchResultKey(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook":
		case "series":
		case "author":
			return `${hit.type}-${hit.uuid}`;
		case "read-listen":
			return `read-listen-${hit.id}`;
		case "collection":
			return `collection-${hit.id}`;
		case "user":
			return `user-${hit.username ?? hit.name}`;
	}
}
