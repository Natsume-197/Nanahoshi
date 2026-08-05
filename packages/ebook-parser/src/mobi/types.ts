export type MobiFormat = "mobi" | "azw3";

export interface MobiMetadata {
	identifier: string;
	title: string;
	authors: string[];
	publisher: string;
	language: string;
	published: string;
	description: string;
	subjects: string[];
	rights: string;
	contributors: string[];
	asin: string;
	isbn: string;
}

export interface MobiSectionReference {
	id: string;
}

export interface MobiTocItem {
	label: string;
	href: string;
	children?: MobiTocItem[];
}

export interface MobiResolvedHref {
	id: string;
	selector: string;
}

export interface MobiResource {
	data: Uint8Array;
	mediaType: string;
}

export interface MobiSection {
	html: string;
	styles: string[];
}

/**
 * A parsed PalmDB ebook. Parsing is side-effect free: resources stay as
 * bytes until a caller asks for them, so the same interface works in a worker,
 * a browser and the server without temporary files or object URLs.
 */
export interface MobiSource {
	readonly format: MobiFormat;
	readonly metadata: MobiMetadata;
	readonly sections: readonly MobiSectionReference[];
	readonly toc: readonly MobiTocItem[];
	loadSection(id: string): MobiSection | undefined;
	loadResource(href: string): MobiResource | undefined;
	getCover(): MobiResource | undefined;
	resolveHref(href: string): MobiResolvedHref | undefined;
}
