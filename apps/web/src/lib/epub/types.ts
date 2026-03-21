export type Section = {
	name: string;
	lastIndex: number;
	content: string;
	startChars: number | undefined;
};

export type Bookmark = {
	readonly paragraphId: number;
	readonly sectionName: string;
	readonly content: string;
};

export type NavigationItem = {
	text: string;
	id?: string;
	file?: string;
	totalChars?: number;
};

export type SourceImage = {
	filename: string;
	blob: Blob;
	url?: string;
};

export interface EpubMetadata {
	identifier: string;
	title: string;
	language: string;
	creator: string[];
	date?: string;
}

export interface EpubManifest {
	nav: NavigationItem[];
	xhtml: {
		lastIndex: number;
		id: string;
		content: string;
		name: string;
		startChars: number;
	}[];
	imgs: { filename: string; blob: Blob }[];
	css: string;
}
