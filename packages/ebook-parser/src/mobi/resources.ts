import type { MobiResource } from "./types";

export type ResourceKind = "embed" | "flow";

const RESOURCE_PATTERN =
	/^ebook-resource:(embed|flow):([0-9a-z]+)(?:\?type=([^\s"'()<>]+))?$/i;

export function resourceHref(
	kind: ResourceKind,
	id: string,
	mediaType?: string,
): string {
	return `ebook-resource:${kind}:${id}${mediaType ? `?type=${encodeURIComponent(mediaType)}` : ""}`;
}

export function parseResourceHref(
	href: string,
): { kind: ResourceKind; id: string; mediaType?: string } | undefined {
	const match = href.match(RESOURCE_PATTERN);
	if (!match?.[1] || !match[2]) return undefined;
	return {
		kind: match[1].toLowerCase() as ResourceKind,
		id: match[2],
		mediaType: match[3] ? decodeURIComponent(match[3]) : undefined,
	};
}

export function withMediaType(
	resource: MobiResource,
	mediaType?: string,
): MobiResource {
	return mediaType && mediaType !== "application/octet-stream"
		? { ...resource, mediaType }
		: resource;
}

export const RESOURCE_HREF_PATTERN =
	/ebook-resource:(?:embed|flow):[0-9a-z]+(?:\?type=[^\s"'()<>]+)?/gi;
