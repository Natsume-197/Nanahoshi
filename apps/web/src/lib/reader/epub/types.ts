/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export interface EpubMetadataMeta {
	"@_name": string;
	"@_content": string;
}

export interface EpubManifestItem {
	"@_href": string;
	"@_id": string;
	"@_media-type": string;
	"@_properties"?: string;
	"@_fallback"?: string;
}

export interface EpubSpineItemRef {
	"@_idref": string;
}

interface EpubDcValue {
	"#text": string;
}

export interface EpubContent {
	package: {
		metadata: {
			"dc:title": string | EpubDcValue | (string | EpubDcValue)[];
			"dc:language": string | EpubDcValue | (string | EpubDcValue)[];
			meta?: EpubMetadataMeta | EpubMetadataMeta[];
		};
		manifest: {
			item: EpubManifestItem | EpubManifestItem[];
		};
		spine: {
			itemref: EpubSpineItemRef | EpubSpineItemRef[];
		};
	};
}

export interface EpubOPFContent {
	"opf:package": {
		"opf:metadata": {
			"dc:title": string | EpubDcValue | (string | EpubDcValue)[];
			"dc:language": string | EpubDcValue | (string | EpubDcValue)[];
			"opf:meta"?: EpubMetadataMeta | EpubMetadataMeta[];
		};
		"opf:manifest": {
			"opf:item": EpubManifestItem | EpubManifestItem[];
		};
		"opf:spine": {
			"opf:itemref": EpubSpineItemRef | EpubSpineItemRef[];
		};
	};
}

export function isOPFType(
	contents: EpubContent | EpubOPFContent,
): contents is EpubOPFContent {
	return (contents as EpubOPFContent)["opf:package"] !== undefined;
}

export function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

export function getManifestItems(
	contents: EpubContent | EpubOPFContent,
): EpubManifestItem[] {
	return toArray(
		isOPFType(contents)
			? contents["opf:package"]["opf:manifest"]["opf:item"]
			: contents.package.manifest.item,
	);
}

export function getSpineItemRefs(
	contents: EpubContent | EpubOPFContent,
): EpubSpineItemRef[] {
	return toArray(
		isOPFType(contents)
			? contents["opf:package"]["opf:spine"]["opf:itemref"]
			: contents.package.spine.itemref,
	);
}

export function getMetadata(contents: EpubContent | EpubOPFContent) {
	return isOPFType(contents)
		? contents["opf:package"]["opf:metadata"]
		: contents.package.metadata;
}
