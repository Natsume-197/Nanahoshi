export type EbookFormat =
	| "epub"
	| "kepub"
	| "mobi"
	| "azw"
	| "azw3"
	| "fb2"
	| "cbz"
	| "cbr"
	| "cb7"
	| "pdf";

export interface EbookIdentifier {
	value: string;
	id?: string;
	scheme?: string;
}

export interface EbookPresentation {
	layout?: string | null;
	spread?: string | null;
	declaresPageResolution?: boolean;
	/** Logical page order declared by EPUB's `spine`. Independent of CSS writing mode. */
	pageProgressionDirection?: "ltr" | "rtl" | "default" | null;
}

export interface EbookMetadata {
	identifier: string;
	identifiers: EbookIdentifier[];
	title: string;
	subtitle: string;
	authors: string[];
	publisher: string;
	language: string;
	published: string;
	description: string;
	subjects: string[];
	rights: string;
	contributors: string[];
	presentation?: EbookPresentation;
}

export interface EbookResource {
	data: Uint8Array;
	mediaType: string;
}

export interface HtmlSectionReference {
	id: string;
}

export interface HtmlSection {
	html: string;
	styles: string[];
	htmlClass?: string;
	bodyClass?: string;
	bodyId?: string;
}

export interface HtmlNavigationTarget {
	sectionId: string;
	selector?: string;
}

export interface HtmlNavigationItem {
	label: string;
	target?: HtmlNavigationTarget;
	children?: HtmlNavigationItem[];
}

/** Reflowable or pre-rendered HTML content with addressable sections. */
export interface HtmlContent {
	readonly kind: "html";
	readonly sections: readonly HtmlSectionReference[];
	readonly toc: readonly HtmlNavigationItem[];
	openSection(id: string): Promise<HtmlSection | undefined>;
	openResource(href: string): Promise<EbookResource | undefined>;
}

export interface PageReference {
	id: string;
	label?: string;
}

/** Fixed-layout content whose pages are image resources, such as comic
 * archives. Keeping it separate from HtmlContent prevents archive formats
 * from pretending to contain chapters or stylesheets. */
export interface PagedContent {
	readonly kind: "pages";
	readonly pages: readonly PageReference[];
	openPage(id: string): Promise<EbookResource | undefined>;
}

export type EbookContent = HtmlContent | PagedContent;

export interface EbookDocument {
	readonly format: EbookFormat;
	readonly metadata: EbookMetadata;
	readonly content: EbookContent;
	openCover(): Promise<EbookResource | undefined>;
	close(): Promise<void>;
}

export interface OpenEbookOptions {
	filename?: string;
	formatHint?: EbookFormat;
}
